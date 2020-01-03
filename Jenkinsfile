pipeline {

    agent none

    triggers { cron('H 8 * * *') }

    options {
        timestamps()
        disableConcurrentBuilds()
    }
    environment {
        AWS_DEFAULT_REGION='eu-west-1'
        FAST_HTTPAUTH=getFastHttpAuth()
        FAST_EMAIL=getFastEmail()
    }

    stages{
        stage('Tests') {
            agent { label 'deploy-node12' }
            steps {
                sh 'npm install'
                sh 'npm test'
            }
        }

        stage('Release') {
            agent { label 'deploy-node12' }
            when { tag 'v*' }
            steps {
                echo "Releasing since commit is tagged"
                sh 'npm version from-git'
                sh 'npm publish'
           }
        }
    }
}
