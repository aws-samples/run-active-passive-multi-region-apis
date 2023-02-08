/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 * SPDX-License-Identifier: MIT-0
 */

import { InfraStack } from './infra-stack';
import { Stage, StageProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { Constants, RegionType } from '../util/constants';
import { AppStack } from './app-stack';

export class PriPipelineStage extends Stage {
    constructor(scope: Construct, id: string, props?: StageProps) {
        super(scope, id, props);
        const infraStack = new InfraStack(this, `${Constants.APP_PREFIX}-infra-${RegionType.PRIMARY}`, {
            envType: RegionType.PRIMARY,
            env: {
                account: process.env.CDK_DEFAULT_ACCOUNT,
                region: process.env.CDK_DEFAULT_REGION
            },
            secondaryRegion: process.env.CDK_SECONDARY_REGION,
            vpcCidr: process.env.VPC_CIDR_RANGE || '172.0.0.0/24',
            dbSecretNameSuffix: process.env.DB_SECRET_NAME_SUFFIX || 'db-secret'
        });
        new AppStack(this, `${Constants.APP_PREFIX}-app-${RegionType.PRIMARY}`, {
            env: {
                account: process.env.CDK_DEFAULT_ACCOUNT,
                region: process.env.CDK_DEFAULT_REGION
            },
            vpc: infraStack.vpc,
            dbProxySecret: infraStack.dbProxySecret,
            dbAccessSecurityGroup: infraStack.dbAccessSecurityGroup,
            encryptionKey: infraStack.encryptionKey,
            envType: RegionType.PRIMARY,
        },
        );
    }
}

export class SecPipelineStage extends Stage {
    constructor(scope: Construct, id: string, props?: StageProps) {
        super(scope, id, props);
        
        const infraStack = new InfraStack(this, `${Constants.APP_PREFIX}-infra-${RegionType.SECONDARY}`,{
            env: {
                account: process.env.CDK_DEFAULT_ACCOUNT,
                region: process.env.CDK_SECONDARY_REGION
            },
            envType: RegionType.SECONDARY,
            primaryStackPrefix: `${Constants.APP_PREFIX}-infra-${RegionType.PRIMARY}`,
            primaryRegion: process.env.CDK_DEFAULT_REGION,
            vpcCidr: process.env.VPC_CIDR_RANGE || '172.0.0.0/24',
            dbSecretNameSuffix: process.env.DB_SECRET_NAME_SUFFIX || 'db-secret'
        });
        new AppStack(this, `${Constants.APP_PREFIX}-app-${RegionType.SECONDARY}`, {
            env: {
                account: process.env.CDK_DEFAULT_ACCOUNT,
                region: process.env.CDK_SECONDARY_REGION
            },
            vpc: infraStack.vpc,
            dbProxySecret: infraStack.dbProxySecret,
            dbAccessSecurityGroup: infraStack.dbAccessSecurityGroup,
            encryptionKey: infraStack.encryptionKey,
            envType: RegionType.SECONDARY,
            primaryStackPrefix: `${Constants.APP_PREFIX}-app-${RegionType.PRIMARY}`
        },
        );
    }
}
