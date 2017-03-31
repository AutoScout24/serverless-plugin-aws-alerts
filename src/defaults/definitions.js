'use strict';

const 
    lambdaNamespace = 'AWS/Lambda', 
    apiGatewayNamespace = 'AWS/ApiGateway',
    dynamoDBNamespace = 'AWS/DynamoDB';

module.exports = {
  functionInvocations: {
    namespace: lambdaNamespace,
    metric: 'Invocations',
    threshold: 100,
    statistic: 'Sum',
    period: 60,
    evaluationPeriods: 1,
    comparisonOperator: 'GreaterThanThreshold',
  },
  functionErrors: {
    namespace: lambdaNamespace,
    metric: 'Errors',
    threshold: 10,
    statistic: 'Sum',
    period: 60,
    evaluationPeriods: 1,
    comparisonOperator: 'GreaterThanThreshold',
  },
  functionDuration: {
    namespace: lambdaNamespace,
    metric: 'Duration',
    threshold: 500,
    statistic: 'Average',
    period: 60,
    evaluationPeriods: 1,
    comparisonOperator: 'GreaterThanThreshold',
  },
  functionThrottles: {
    namespace: lambdaNamespace,
    metric: 'Throttles',
    threshold: 50,
    statistic: 'Sum',
    period: 60,
    evaluationPeriods: 1,
    comparisonOperator: 'GreaterThanThreshold',
  },
  apiGateway5xx: {
    namespace: apiGatewayNamespace,
    metric: '5XXError',
    threshold: 1,
    statistic: 'Sum',
    period: 60,
    evaluationPeriods: 1,
    comparisonOperator: 'GreaterThanThreshold'
  },
  apiGateway4xx: {
    namespace: apiGatewayNamespace,
    metric: '4XXError',
    threshold: 10,
    statistic: 'Sum',
    period: 60,
    evaluationPeriods: 1,
    comparisonOperator: 'GreaterThanThreshold'
  },
  dynamoDbReadThrottleEvents: {
    namespace: dynamoDBNamespace,
    metric: 'ReadThrottleEvents',
    threshold: 20,
    statistic: 'Sum',
    period: 300,
    evaluationPeriods: 1,
    comparisonOperator: 'GreaterThanThreshold'
  },  
  dynamoDbWriteThrottleEvents: {
    namespace: dynamoDBNamespace,
    metric: 'WriteThrottleEvents',
    threshold: 20,
    statistic: 'Sum',
    period: 300,
    evaluationPeriods: 1,
    comparisonOperator: 'GreaterThanThreshold'
  }
};
