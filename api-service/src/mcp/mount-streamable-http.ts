/**
 * Streamable HTTP MCP transport mounted on Express (multi-session map pattern
 * from @modelcontextprotocol/sdk examples). Optionally guards POST/GET/DELETE
 * with the API key middleware so MCP tools can resolve `req.userId`.
 */

import type { IRouter, Request, Response, RequestHandler } from 'express';
import { randomUUID } from 'node:crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { extractToken } from '../middleware/auth';
import { createPdfMcpServer } from './pdf-mcp-server';

interface SessionEntry {
    transport: StreamableHTTPServerTransport;
    userId: string | null;
}

const sessions = new Map<string, SessionEntry>();

function getSessionHeader(req: Request): string | undefined {
    const raw = req.headers['mcp-session-id'];
    if (typeof raw === 'string') return raw;
    if (Array.isArray(raw)) return raw[0];
    return undefined;
}

function isInitBody(body: unknown): boolean {
    if (body === undefined || body === null) return false;
    if (Array.isArray(body)) {
        return body.some((m) => isInitializeRequest(m));
    }
    return isInitializeRequest(body);
}

export interface MountStreamableMcpHttpOptions {
    /** Optional middleware (e.g. apiKeyAuth) applied to every MCP request. */
    authMiddleware?: RequestHandler;
}

export function mountStreamableMcpHttp(
    router: IRouter,
    mountPath = '/',
    options: MountStreamableMcpHttpOptions = {},
): void {
    const postHandler = async (req: Request, res: Response) => {
        const sessionId = getSessionHeader(req);

        try {
            if (sessionId && sessions.has(sessionId)) {
                const entry = sessions.get(sessionId)!;
                // Only refresh identity when the client sent credentials; some
                // transports omit Authorization on follow-up GET/SSE polls.
                if (extractToken(req)) {
                    entry.userId = req.userId ?? null;
                }
                await entry.transport.handleRequest(req, res, req.body);
                return;
            }

            if (!sessionId && isInitBody(req.body)) {
                const transport = new StreamableHTTPServerTransport({
                    sessionIdGenerator: () => randomUUID(),
                    onsessioninitialized: (sid) => {
                        sessions.set(sid, { transport, userId: req.userId ?? null });
                    },
                });

                transport.onclose = () => {
                    const sid = transport.sessionId;
                    if (sid && sessions.has(sid)) {
                        sessions.delete(sid);
                    }
                };

                const server = createPdfMcpServer({
                    getUserId: () => {
                        const sid = transport.sessionId;
                        if (sid && sessions.has(sid)) {
                            return sessions.get(sid)!.userId;
                        }
                        return req.userId ?? null;
                    },
                });
                await server.connect(transport);
                await transport.handleRequest(req, res, req.body);
                return;
            }

            res.status(400).json({
                jsonrpc: '2.0',
                error: {
                    code: -32000,
                    message: 'Bad Request: expected MCP initialize or a valid Mcp-Session-Id header',
                },
                id: null,
            });
        } catch (err) {
            console.error('[MCP] POST error:', err);
            if (!res.headersSent) {
                res.status(500).json({
                    jsonrpc: '2.0',
                    error: { code: -32603, message: 'Internal server error' },
                    id: null,
                });
            }
        }
    };

    const getHandler = async (req: Request, res: Response) => {
        const sessionId = getSessionHeader(req);
        if (!sessionId || !sessions.has(sessionId)) {
            res.status(400).send('Invalid or missing Mcp-Session-Id');
            return;
        }
        try {
            const entry = sessions.get(sessionId)!;
            if (extractToken(req)) {
                entry.userId = req.userId ?? null;
            }
            await entry.transport.handleRequest(req, res);
        } catch (err) {
            console.error('[MCP] GET error:', err);
            if (!res.headersSent) {
                res.status(500).send('Internal server error');
            }
        }
    };

    const deleteHandler = async (req: Request, res: Response) => {
        const sessionId = getSessionHeader(req);
        if (!sessionId || !sessions.has(sessionId)) {
            res.status(400).send('Invalid or missing Mcp-Session-Id');
            return;
        }
        try {
            const entry = sessions.get(sessionId)!;
            if (extractToken(req)) {
                entry.userId = req.userId ?? null;
            }
            await entry.transport.handleRequest(req, res);
        } catch (err) {
            console.error('[MCP] DELETE error:', err);
            if (!res.headersSent) {
                res.status(500).send('Internal server error');
            }
        }
    };

    const handlers: RequestHandler[] = [];
    if (options.authMiddleware) handlers.push(options.authMiddleware);

    router.post(mountPath, ...handlers, postHandler);
    router.get(mountPath, ...handlers, getHandler);
    router.delete(mountPath, ...handlers, deleteHandler);
}
