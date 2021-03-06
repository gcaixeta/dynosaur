import _ from 'lodash';

/**
 * @param  {array} keys - Hash and Range keys
 * @returns {object} object - formatted keys object
 */
function formatSchemaParams(keys) {
    const params = {
        AttributeDefinitions: [],
        KeySchema: []
    };

    keys.forEach((key, index) => {
        params.AttributeDefinitions.push({
            AttributeName: key.name,
            AttributeType: key.type
        });
        params.KeySchema.push({
            AttributeName: key.name,
            KeyType: index ? 'RANGE' : 'HASH'
        });
    });

    return params;
}

/**
 * @param  {string} tableName - Table Name
 * @param  {object} hashKey - { name: 'string', type: 'string S | N | B' }
 * @param  {object} rangeKey - Optional { name: 'string', type: 'string S | N | B' }
 * @param  {object} awsParams - Optional Refer to AWS docs for these configurations
 * @returns {object} Formatted params
 */
function createTable(tableName, hashKey, rangeKey, params = {}) {
    let keys = [hashKey];
    // Add range key to keys array
    if (rangeKey) {
        keys.push(rangeKey);
    }

    // Build Params
    params.TableName = tableName;

    keys = formatSchemaParams(keys);
    const attributes = params.AttributeDefinitions || [];

    params.AttributeDefinitions = attributes.concat(keys.AttributeDefinitions);
    params.KeySchema = keys.KeySchema;

    params.ProvisionedThroughput = {
        ReadCapacityUnits: 1,
        WriteCapacityUnits: 1
    };

    return params;
}

/**
 * @param  {object} Item - Table Column {key: value}
 * @returns {object} DynamoDB item - {key: {type: value}}
 */
function formatToDynamoItem(item) {
    let obj = {};
    if (_.isArray(item)) {
        if (_.every(item, Number)) {
            obj = {
                'NS': item.map((num) => {
                    return num.toString();
                })
            };
        } else if (_.every(item, String)) {
            obj = {
                'SS': item
            };
        } else {
            throw new TypeError('Expected homogenous array of numbers or strings');
        }
    } else if (_.isNumber(item)) {
        obj = {
            'N': item.toString()
        };
    } else if (_.isString(item)) {
        obj = {
            'S': item
        };
    } else if (_.isObject(item)) {
        throw new TypeError('Object is not serializable to a dynamo data type');
    } else if (!item) {
        throw new TypeError('Cannot call convert_to_dynamo() with no arguments');
    }

    return obj;
}

/**
 * @param  {object} Items - Object of table columns
 * @return {object} DynamoDB items - Object of DynamoDB items
 */
function formatToDynamoItems(items) {
    _.forIn(items, (value, key) => {
        items[key] = formatToDynamoItem(value);
    });

    return items;
}

/**
 * @param  {object} Item - Table Column {key: value}
 * @returns {object} DynamoDB item - {key: {type: value}}
 */
function formatFromDynamoItem(item) {
    let obj = {};

    if (_.isArray(item)) {
        _.forEach(item, (value, key) => {
            obj[key] = formatFromDynamoItem(value);
        });
    }
    if (_.isObject(item)) {
        obj = _.transform(item, (res, val, key) => {
            if (val.S) {
                res[key] = val.S;
                return res;
            } else if (val.SS) {
                res[key] = val.SS;
                return res;
            } else if (val.N) {
                res[key] = parseFloat(val.N);
                return res;
            } else if (val.NS) {
                res[key] = _.map(val.NS, parseFloat);
                return res;
            }
        });
    }

    return obj;
}

/**
 * @param  {object} DynamoDB items - Object of DynamoDB items
 * @return {object} Items - Object of table columns
 */
function formatFromDynamoItems(items) {
    _.forIn(items, (value, key) => {
        items[key] = formatFromDynamoItem(value);
    });

    return items;
}


/**
 * @param  {object} condition - { unique: ['hashkey', 'rangeKey'] }
 * @return {object} conditionExpression - DynamoDB condition expression
 */
function conditionBuilder(condition = {}) {
    let conditionExpression = null;

    if (condition.unique && _.isArray(condition.unique)) {
        const keys = condition.unique;
        const conditionArray = [];

        if (_.every(keys, String)) {
            keys.map((key) => {
                return conditionArray.push(`attribute_not_exists(${key})`);
            });
        }
        conditionExpression = {
            ConditionExpression: conditionArray.join(' AND ')
        };
    } else if (condition.equals) {
        // Do something
    }

    return conditionExpression;
}

/**
 * @param  {object} keys - object of columns to add/update {key:value,...}
 * @return {object} DynamoDB formated update expression
 */
function updateItem(keys) {
    const params = {
        ExpressionAttributeNames: {},
        ExpressionAttributeValues: {},
        UpdateExpression: null
    };

    const updateExpression = [];
    _.forIn(keys, (value, key) => {
        updateExpression.push(`#${key}Attribute = :${key}Value`);
        params.ExpressionAttributeValues[`:${key}Value`] = formatToDynamoItem(value);
        params.ExpressionAttributeNames[`#${key}Attribute`] = key;
    });

    params.UpdateExpression = 'SET ' + updateExpression.join(', ');

    return params;
}

/**
 * @param  {keys} keys - {key:value,...}
 * @return {object} DynamoDB formated KeyConditions expression
 */
function getItem(keys) {
    const params = {
        KeyConditions: {}
    };

    _.forIn(keys, (value, key) => {
        params.KeyConditions[key] = {
            ComparisonOperator: 'EQ',
            AttributeValueList: [formatToDynamoItem(value)]
        };
    });

    return params;
}

export default {
    createTable,
    formatSchemaParams,
    formatToDynamoItem,
    formatToDynamoItems,
    formatFromDynamoItem,
    formatFromDynamoItems,
    conditionBuilder,
    updateItem,
    getItem
};
