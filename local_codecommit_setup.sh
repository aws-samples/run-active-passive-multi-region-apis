#!/bin/bash
aws codecommit list-repositories

cd ..
mkdir run-active-passive-multi-region-apis-codecommit
cd run-active-passive-multi-region-apis-codecommit
git clone codecommit::us-east-1://ToDoMgmtRepo

cd ..

cp run-active-passive-multi-region-apis/README.md run-active-passive-multi-region-apis-codecommit/ToDoMgmtRepo 
cp run-active-passive-multi-region-apis/cdk.json run-active-passive-multi-region-apis-codecommit/ToDoMgmtRepo
cp -r run-active-passive-multi-region-apis/lib run-active-passive-multi-region-apis-codecommit/ToDoMgmtRepo 
cp -r run-active-passive-multi-region-apis/bin run-active-passive-multi-region-apis-codecommit/ToDoMgmtRepo 
cp run-active-passive-multi-region-apis/tsconfig.json run-active-passive-multi-region-apis-codecommit/ToDoMgmtRepo 
cp -r run-active-passive-multi-region-apis/assets run-active-passive-multi-region-apis-codecommit/ToDoMgmtRepo
cp run-active-passive-multi-region-apis/cdk.context.json run-active-passive-multi-region-apis-codecommit/ToDoMgmtRepo 
cp run-active-passive-multi-region-apis/deploy.sh run-active-passive-multi-region-apis-codecommit/ToDoMgmtRepo 
cp run-active-passive-multi-region-apis/package.json run-active-passive-multi-region-apis-codecommit/ToDoMgmtRepo 
cp -r run-active-passive-multi-region-apis/util run-active-passive-multi-region-apis-codecommit/ToDoMgmtRepo
cp -r run-active-passive-multi-region-apis/.env run-active-passive-multi-region-apis-codecommit/ToDoMgmtRepo/.env
cp -r run-active-passive-multi-region-apis/.gitignore run-active-passive-multi-region-apis-codecommit/ToDoMgmtRepo/.gitignore
cp -r run-active-passive-multi-region-apis/tsconfig.json run-active-passive-multi-region-apis-codecommit/ToDoMgmtRepo/tsconfig.json
cd run-active-passive-multi-region-apis-codecommit/ToDoMgmtRepo
rm -rf assets/lambda/node_modules/
git add . && git commit -m "initial commit" && git push