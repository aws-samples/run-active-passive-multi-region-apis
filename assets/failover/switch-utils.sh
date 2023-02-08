#!/bin/bash
DIR=$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )
process_nm=switch-utils
logfile="${DIR}/${process_nm}.log"
currentDate=$(date '+%Y%m%d')
########################################################################################
# Function which triggers managed fail over of RDS cluster
# Inputs: global cluster name, target regional cluster identifier, target cluster region
########################################################################################
failover_global_db() {
     echo "Failing Over Global Database"
     echo $1
     echo $2
     echo $3
     aws rds failover-global-cluster --global-cluster-identifier $1 --target-db-cluster-identifier $2 --region $3 >> "${logfile}"
     wait_for_db_availability $3 $1
     echo "FailOver Global Database complete"
}
########################################################################################
# Function which checks the global cluster failover status
# Inputs: region, global cluster identifier
########################################################################################
wait_for_db_availability() {
    count=$(aws rds describe-global-clusters --region $1 --query "length(GlobalClusters[?Status!='available' && GlobalClusterIdentifier=='$2'])")
    while [ $count -gt 0 ]
    do
            echo "Database failover in progress: " $count
            sleep 10
            count=$(aws rds describe-global-clusters --region $1 --query "length(GlobalClusters[?Status!='available' && GlobalClusterIdentifier=='$2'])")
    done
}
########################################################################################
# Function which promotes a regional RDS cluster in global cluster as stand alone cluster
# Inputs: region, global cluster identifier, target cluster, aws region
########################################################################################
promote_to_standalone_cluster() {
     global_cluster_name=$1
     target_cluster_identifier_arn=$2
     target_cluster_identifier=$3
     aws_region=$4
     echo $global_cluster_name
     echo $target_cluster_identifier
     echo "Promoting $target_cluster_identifier to standalone cluster"
     aws rds remove-from-global-cluster --global-cluster-identifier $global_cluster_name --db-cluster-identifier $target_cluster_identifier_arn --region $aws_region
     wait_for_regional_cluster_availability $aws_region $target_cluster_identifier
     echo "Promoting to standalone cluster complete"
}
########################################################################################
# Function which checks for regional cluster availability
# Inputs: region, regional cluster identifier
########################################################################################
wait_for_regional_cluster_availability() {
    sleep 10
    count=$(aws rds describe-db-clusters --region $1  --db-cluster-identifier $2 --query "length(DBClusters[?Status!='available'])")
    while [ $count -gt 0 ]
    do
            echo "Promoting $2 as standalone regional cluster: " $count
            sleep 10
            count=$(aws rds describe-db-clusters --region $1 --db-cluster-identifier $2 --query "length(DBClusters[?Status!='available'])")
    done
}

########################################################################################
# Function which updates the Origin of the Cloudfront
# Inputs: Cloudfront Distribution ID, Origin ID, New Origin Domain Name 
########################################################################################
update_cloudfront_origin_domain() {
     echo "Updating the Cloudfront Origin"
     echo $1
     echo $2
     echo $3     
     
     # 0) You need to set the followings for your case
     CLOUDFRONT_DISTRIBUTION_ID=$1
     CLOUDFRONT_ORIGIN_ID=$2
     CLOUDFRONT_NEW_ORIGIN_DOMAIN_NAME=$3

     DIST_CONFIG_OLD_FILENAME="dist-config.json" # a temp file, which will be removed later
     DIST_CONFIG_NEW_FILENAME="dist-config2.json" # a temp file, which will be removed later

     # 1) Get the current config, entirely, and put it in a file
     aws cloudfront get-distribution --region us-east-1 --id $CLOUDFRONT_DISTRIBUTION_ID > $DIST_CONFIG_OLD_FILENAME

     # 2) Extract the Etag which we need this later for update
     Etag=`cat $DIST_CONFIG_OLD_FILENAME | jq '.ETag' | tr -d \"`

     # 3) Modify the config as wished, for me I used `jq` extensively to update the "OriginPath" of the desired "originId"
     cat $DIST_CONFIG_OLD_FILENAME | jq \
     --arg targetOriginId $CLOUDFRONT_ORIGIN_ID \
     --arg newDomainName $CLOUDFRONT_NEW_ORIGIN_DOMAIN_NAME \
     '.Distribution.DistributionConfig | .Origins.Items = (.Origins.Items | map(if (.Id == $targetOriginId) then (.DomainName = $newDomainName) else . end))' \
     > $DIST_CONFIG_NEW_FILENAME

     # 4) Update the distribution with the new file
     aws cloudfront update-distribution --region=us-east-1 --id $CLOUDFRONT_DISTRIBUTION_ID \
     --distribution-config "file://${DIST_CONFIG_NEW_FILENAME}" \
     --if-match $Etag \
     > /dev/null

     #5) Invalidate the distribution to pick up the changes
     aws cloudfront create-invalidation --region=us-east-1 --distribution-id $CLOUDFRONT_DISTRIBUTION_ID --paths "/*"

     # 6) Clean up
     rm -f $DIST_CONFIG_OLD_FILENAME $DIST_CONFIG_NEW_FILENAME

     echo "Cloudfront Distribution Deployment started"
}


########################################################################################
# Function which checks for cloudfront distribution update status
# Inputs: region, regional cluster identifier
########################################################################################
wait_for_cloudfront_update() {
    sleep 10
    isDeployed=$(aws cloudfront get-distribution --id $1 --region=us-east-1 --query "Distribution.Status!='Deployed'")
    while $isDeployed
    do
            echo "Updating the Cloudfront Distribution $1: " $count
            sleep 10
            isDeployed=$(aws cloudfront get-distribution --id $1 --region=us-east-1 --query "Distribution.Status!='Deployed'")
    done
}
