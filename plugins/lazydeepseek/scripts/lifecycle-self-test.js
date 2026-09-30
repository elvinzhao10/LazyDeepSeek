'use strict';

const { verifyStagedPackage } = require('./lifecycle/bootstrap');

const result = verifyStagedPackage(process.cwd(), 'LazyDeepSeek');
process.stdout.write(`${JSON.stringify({ product: 'LazyDeepSeek', status: 'passed', version: result.version })}\n`);
