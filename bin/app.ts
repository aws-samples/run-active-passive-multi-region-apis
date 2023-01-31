#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { FailoverPipelineStack as FailoverPipelineStack } from '../lib/failover-pipeline-stack';
import { AppPipelineStack } from '../lib/pipeline-stack';
import { Constants } from '../util/constants';
require('dotenv').config();

const app = new cdk.App();
// Application Pipeline Stack
new AppPipelineStack(app, `${Constants.APP_PREFIX}`, {
    env: {
        account: process.env.CDK_DEFAULT_ACCOUNT,
        region: process.env.CDK_DEFAULT_REGION
    }
});

// Failover Pipeline Stack
new FailoverPipelineStack(app, `${Constants.MULTI_REGION_FAILOVER_PREFIX}`, {
    env: {
        account: process.env.CDK_DEFAULT_ACCOUNT,
        region: process.env.CDK_DEFAULT_REGION
    }
});
