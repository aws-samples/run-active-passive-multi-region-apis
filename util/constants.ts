/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 * SPDX-License-Identifier: MIT-0
 */

export abstract class Constants {
    static readonly APP_PREFIX = "ToDoMgmt";
    static readonly MULTI_REGION_FAILOVER_PREFIX = "ToDoMgmt-failover";
}

export const enum RegionType {
    PRIMARY = 'pri',
    SECONDARY = 'secd'
}
