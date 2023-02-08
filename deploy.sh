#!/bin/bash
npm install
npm run build
cd assets/lambda
npm install
cd ../..
npm run package
npx cdk synth
# Note bootstrapping in two regions. Checkout for failures (already existing/cdk mismatch etc.,)
npx cdk bootstrap
npx cdk deploy ToDoMgmt --require-approval never
npx cdk deploy ToDoMgmt/PriDeploy/ToDoMgmt-infra-pri --require-approval never
npx cdk deploy ToDoMgmt/PriDeploy/ToDoMgmt-app-pri --require-approval never 

# This creates the initial table on the primary cluster. this can be done from AWS console also
aws lambda invoke --payload '{"action": "CREATE_TABLE"}' --function-name ToDoMgmt-app-pri-CreateTableFunction --cli-binary-format raw-in-base64-out  /dev/stdout

### Note. This will create AWS services for the secondary region. While this is executing, you can validate the primary region (refer "Testing" section on the readme)
npx cdk deploy ToDoMgmt/SecdDeploy/ToDoMgmt-infra-secd --require-approval never
npx cdk deploy ToDoMgmt/SecdDeploy/ToDoMgmt-app-secd --require-approval never
npx cdk deploy ToDoMgmt-failover --require-approval never

