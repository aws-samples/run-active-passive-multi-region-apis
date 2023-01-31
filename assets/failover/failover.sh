#!/bin/bash
DIR=$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )
source "$DIR/switch-utils.sh"

echo "DIR=${DIR}"
AWS_ACCOUNT=$(aws sts get-caller-identity --query 'Account' --output text)
TARGET_CLUSTER_ARN="arn:aws:rds:$AWS_DEST_REGION:$AWS_ACCOUNT:cluster:$TARGET_CLUSTER_ID"
###################################################################
#           Reading the config file for various parameters
###################################################################
echo "Using below Configurations:"
echo "GLOBAL_CLUSTER_NAME=${GLOBAL_CLUSTER_NAME}"
echo "AWS_ACCOUNT=${AWS_ACCOUNT}"
echo "AWS_SRC_REGION=${AWS_SRC_REGION}"
echo "AWS_DEST_REGION=${AWS_DEST_REGION}"
echo "TARGET_CLUSTER_ID=${TARGET_CLUSTER_ID}"
echo "SRC_CLUSTER_ID=${SRC_CLUSTER_ID}"
echo "TARGET_RDS_PROXY_NAME=${TARGET_RDS_PROXY_NAME}"
echo "SRC_RDS_PROXY_NAME=${SRC_RDS_PROXY_NAME}"
echo "TARGET_CLUSTER_ARN=${TARGET_CLUSTER_ARN}"
echo "CLOUDFRONT_DISTRIBUTION_ID=${CLOUDFRONT_DISTRIBUTION_ID}"
echo "CLOUDFRONT_ORIGIN_ID=${CLOUDFRONT_ORIGIN_ID}"
echo "CLOUDFRONT_NEW_ORIGIN_DOMAIN_NAME=${CLOUDFRONT_NEW_ORIGIN_DOMAIN_NAME}"
echo "BREAK_CLUSTER=${BREAK_CLUSTER}"

#######################################################
    # Update Cloudfront Origin
#######################################################
echo "Updating Cloudfront Origin"
    update_cloudfront_origin_domain $CLOUDFRONT_DISTRIBUTION_ID $CLOUDFRONT_ORIGIN_ID $CLOUDFRONT_NEW_ORIGIN_DOMAIN_NAME

if [[ ( "$BREAK_CLUSTER" == "breakcluster" ) ]]; then
   
    #######################################################
    # Promote to standalone cluster
    #######################################################
    echo "Promoting target cluster to standalone"
    promote_to_standalone_cluster $GLOBAL_CLUSTER_NAME $TARGET_CLUSTER_ARN $TARGET_CLUSTER_ID $AWS_DEST_REGION 
    echo "Promoting target cluster complete"
else
    #######################################################
    # Initiate Aurora Global Cluster failover
    #######################################################

    echo "Failing Over Global Database"
    failover_global_db $GLOBAL_CLUSTER_NAME $TARGET_CLUSTER_ARN $AWS_DEST_REGION
    echo "FailOver Global Database complete"
fi

#######################################################
    # Check if Cloudfront Update is completed
#######################################################
   wait_for_cloudfront_update $CLOUDFRONT_DISTRIBUTION_ID
