#!/bin/bash
export $(cat .env)

cdk destroy ToDoMgmt/SecdDeploy/ToDoMgmt-app-secd --require-approval never --force
cdk destroy ToDoMgmt/SecdDeploy/ToDoMgmt-infra-secd --require-approval never --force
cdk destroy ToDoMgmt/PriDeploy/ToDoMgmt-app-pri --require-approval never  --force
cdk destroy ToDoMgmt/PriDeploy/ToDoMgmt-infra-pri --require-approval never --force

ALL_S3=$(aws s3api list-buckets --query 'Buckets[*].[Name]' --output text | grep "todomgmt-")
for TODO_BUCKET in $ALL_S3
do
    aws s3 rm s3://$TODO_BUCKET --recursive
    aws s3 rb s3://$TODO_BUCKET
done

cdk destroy ToDoMgmt-failover --require-approval never --force 
cdk destroy ToDoMgmt --require-approval never --force

aws cloudformation delete-stack --stack-name ToDoMgmt-support-$CDK_SECONDARY_REGION --region $CDK_SECONDARY_REGION 