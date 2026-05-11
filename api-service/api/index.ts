/**
 * Vercel serverless entry — all HTTP routes are rewritten here (see `vercel.json`).
 * https://vercel.com/docs/frameworks/backend/express
 */

import { getApp } from '../src/app';

export default getApp();
