'use strict';

// Try to remove this. Such a large package
const _ = require('lodash');

const Naming = require('./naming');
const defaultDefinitions = require('./defaults/definitions');

class Plugin {
	constructor(serverless, options) {
		this.serverless = serverless;
		this.options = options;

		this.awsProvider = this.serverless.getProvider('aws');
		this.providerNaming = this.awsProvider.naming;
		this.naming = new Naming();

		this.hooks = {
			'deploy:compileEvents': this.compileCloudWatchAlarms.bind(this),
		};
	}

	getConfig() {
		return this.serverless.service.custom.alerts;
	}

	getDefinitions(config) {
		return _.merge({}, defaultDefinitions, config.definitions);
	}

	getAlarms(alarms, definitions, tableNames) {
		if(!alarms) return [];

		return alarms.reduce((result, alarm) => {
			if (_.isString(alarm)) {
				const definition = definitions[alarm];

				if (!definition) {
					throw new Error(`Alarm definition ${alarm} does not exist!`);
				}
				if (tableNames && tableNames.length !== 0) {
					tableNames.forEach(table => {
						result.push(Object.assign({}, definition, {
							name: `${_.upperFirst(table)}${_.upperFirst(alarm)}`,
							dimensions: [{
								Name: "TableName",
								Value: table
							}]
						}));
					})
				} else {
					result.push(Object.assign({}, definition, {
						name: alarm
					}));
				}
			} else if (_.isObject(alarm)) {
				result.push(alarm);
			}

			return result;
		}, []);
	}

	getGlobalAlarms(config, definitions) {
		if (!config) throw new Error('Missing config argument');
		if (!definitions) throw new Error('Missing definitions argument');

		return this.getAlarms(config.global, definitions);
	}

	getTableAlarms(config, definitions) {
		if (!config) throw new Error('Missing config argument');
		if (!definitions) throw new Error('Missing definitions argument');

		return this.getAlarms(config.table, definitions, this.getTableNames());
	}

	getTableNames(){
		const resources = this.serverless.service.resources.Resources;
		return Object.keys(resources)
				.map(key => {
					return {
						name: key,
						value: resources[key]
					}
				}).filter(resource => {
					return resource.value.Type === "AWS::DynamoDB::Table";
				}).map(resource => resource.name);
		}

	getFunctionAlarms(functionObj, config, definitions) {
		if (!config) throw new Error('Missing config argument');
		if (!definitions) throw new Error('Missing definitions argument');

		const alarms = _.union(config.function, functionObj.alarms);
		return this.getAlarms(alarms, definitions);
	}

	getAlarmCloudFormation(alertTopics, definition, functionRef) {
		const okActions = [];
		const alarmActions = [];
		const insufficientDataActions = [];

		if(alertTopics.ok) {
			okActions.push(alertTopics.ok);
		}

		if(alertTopics.alarm) {
			alarmActions.push(alertTopics.alarm);
		}

		if(alertTopics.insufficientData) {
			insufficientDataActions.push(alertTopics.insufficientData);
		}

		const namespace = definition.pattern ?
			this.awsProvider.naming.getStackName() :
			definition.namespace;

		let metricName, dimensions;

		if(!functionRef) {
			metricName = definition.metric;
			dimensions = definition.dimensions;
		} else {
			metricName = definition.pattern ?
				this.naming.getPatternMetricName(definition.metric, functionRef) :
				definition.metric;

			dimensions = definition.pattern ? [] : [{
				Name: 'FunctionName',
				Value: {
					Ref: functionRef,
				}
			}];
		}

		var resultCfn = {
			Type: 'AWS::CloudWatch::Alarm',
			Properties: {
				Namespace: namespace,
				MetricName: metricName,
				Threshold: definition.threshold,
				Statistic: definition.statistic,
				Period: definition.period,
				EvaluationPeriods: definition.evaluationPeriods,
				ComparisonOperator: definition.comparisonOperator,
				OKActions: okActions,
				AlarmActions: alarmActions,
				InsufficientDataActions: insufficientDataActions,
				Dimensions: dimensions,
			}
		};
		return resultCfn;
	}

	getSnsTopicCloudFormation(topicName, notifications) {
		const subscription = (notifications || []).map((n) => ({
			Protocol: n.protocol,
			Endpoint: n.endpoint
		}));

		return {
			Type: 'AWS::SNS::Topic',
			Properties: {
				TopicName: topicName,
				Subscription: subscription,
			}
		};
	}

	compileAlertTopics(config) {
		const alertTopics = {};

		if(config.topics) {
			Object.keys(config.topics).forEach((key) => {
				const topicConfig = config.topics[key];
				const isTopicConfigAnObject = _.isObject(topicConfig);

				const topic = isTopicConfigAnObject ? topicConfig.topic : topicConfig;
				const notifications = isTopicConfigAnObject ? topicConfig.notifications : [];

				if(topic) {
					if (topic.indexOf('arn:') === 0) {
						alertTopics[key] = topic;
					} else {
						const cfRef = `AwsAlerts${_.upperFirst(key)}`;
						alertTopics[key] = { Ref: cfRef };

						this.addCfResources({
							[cfRef]: this.getSnsTopicCloudFormation(topic, notifications),
						});
					}
				}
			});
		}

		return alertTopics;
	}

	getLogMetricCloudFormation(alarm, functionName, normalizedFunctionName, functionObj) {
		if(!alarm.pattern) return {};

		const logMetricCFRefBase = this.naming.getLogMetricCloudFormationRef(normalizedFunctionName, alarm.name);
		const logMetricCFRefALERT = `${logMetricCFRefBase}ALERT`;
		const logMetricCFRefOK = `${logMetricCFRefBase}OK`;

		const cfLogName = this.providerNaming.getLogGroupLogicalId(functionName);
		const metricNamespace = this.providerNaming.getStackName();
		const logGroupName =  this.providerNaming.getLogGroupName(functionObj.name);
		const metricName = this.naming.getPatternMetricName(alarm.metric, normalizedFunctionName);

		return {
			[logMetricCFRefALERT]: {
				Type: 'AWS::Logs::MetricFilter',
				DependsOn: cfLogName,
				Properties: {
					FilterPattern: alarm.pattern,
					LogGroupName: logGroupName,
					MetricTransformations: [{
						MetricValue: 1,
						MetricNamespace: metricNamespace,
						MetricName: metricName
					}]
				}
			},
			[logMetricCFRefOK]: {
				Type: 'AWS::Logs::MetricFilter',
				DependsOn: cfLogName,
				Properties: {
					FilterPattern: '',
					LogGroupName: logGroupName,
					MetricTransformations: [{
						MetricValue: 0,
						MetricNamespace: metricNamespace,
						MetricName: metricName
					}]
				}
			}
		};
	}

	compileAlarms(config, definitions, alertTopics) {
		// do global only once!
		// what happens if dimensions is empty?
		const globalAlarms = this.getGlobalAlarms(config, definitions);
		this.addCfResources(globalAlarms.reduce((statements, alarm) => {
			statements[alarm.name] = this.getAlarmCloudFormation(alertTopics, alarm);
			return statements;
		}, {}));

		const tableAlarms = this.getTableAlarms(config, definitions);
		this.addCfResources(tableAlarms.reduce((statements, alarm) => {
			statements[alarm.name] = this.getAlarmCloudFormation(alertTopics, alarm);
			return statements;
		}, {}));

		this.serverless.service.getAllFunctions().forEach((functionName) => {
			const functionObj = this.serverless.service.getFunction(functionName);
			const normalizedFunctionName = this.providerNaming.getLambdaLogicalId(functionName);
			const alarms = this.getFunctionAlarms(functionObj, config, definitions);

			const alarmStatements = alarms.reduce((statements, alarm) => {
				const key = this.naming.getAlarmCloudFormationRef(alarm.name, functionName);
				statements[key] = this.getAlarmCloudFormation(alertTopics, alarm, normalizedFunctionName);

				const logMetricCF = this.getLogMetricCloudFormation(alarm, functionName, normalizedFunctionName, functionObj);
				_.merge(statements, logMetricCF);

				return statements;
			}, {});

			this.addCfResources(alarmStatements);
		});
	}

	compileCloudWatchAlarms() {
		const config = this.getConfig();
		if(!config) {
			// TODO warn no config
			return;
		}

		if(config.stages && !_.includes(config.stages, this.options.stage)) {
			this.serverless.cli.log(`Warning: Not deploying alerts on stage ${this.options.stage}`);
			return;
		}

		const definitions = this.getDefinitions(config);
		const alertTopics = this.compileAlertTopics(config);

		this.compileAlarms(config, definitions, alertTopics);
	}

	addCfResources(resources) {
		_.merge(this.serverless.service.provider.compiledCloudFormationTemplate.Resources, resources);
	}
}

module.exports = Plugin;
