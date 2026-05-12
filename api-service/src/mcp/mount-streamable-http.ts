/**
 * Streamable HTTP MCP transport mounted on Express (multi-session map pattern
 * from @modelcontextprotocol/sdk examples).
 */

import type { IRouter, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { createPdfMcpServer } from './pdf-mcp-server';

const transports = new Map<string, StreamableHTTPServerTransport>();

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

export function mountStreamableMcpHttp(router: IRouter, mountPath = '/'): void {
    const postHandler = async (req: Request, res: Response) => {
        const sessionId = getSessionHeader(req);

        try {
            let transport: StreamableHTTPServerTransport;

            if (sessionId && transports.has(sessionId)) {
                transport = transports.get(sessionId)!;
            } else if (!sessionId && isInitBody(req.body)) {
                transport = new StreamableHTTPServerTransport({
                    sessionIdGenerator: () => randomUUID(),
                    onsessioninitialized: (sid) => {
                        transports.set(sid, transport);
                    },
                });

                transport.onclose = () => {
                    const sid = transport.sessionId;
                    if (sid && transports.has(sid)) {
                        transports.delete(sid);
                    }
                };

                const server = createPdfMcpServer();
                await server.connect(transport);
                await transport.handleRequest(req, res, req.body);
                return;
            } else {
                res.status(400).json({
                    jsonrpc: '2.0',
                    error: {
                        code: -32000,
                        message: 'Bad Request: expected MCP initialize or a valid Mcp-Session-Id header',
                    },
                    id: null,
                });
                return;
            }

            await transport.handleRequest(req, res, req.body);
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
        if (!sessionId || !transports.has(sessionId)) {
            res.status(400).send('Invalid or missing Mcp-Session-Id');
            return;
        }
        const transport = transports.get(sessionId)!;
        try {
            await transport.handleRequest(req, res);
        } catch (err) {
            console.error('[MCP] GET error:', err);
            if (!res.headersSent) {
                res.status(500).send('Internal server error');
            }
        }
    };

    const deleteHandler = async (req: Request, res: Response) => {
        const sessionId = getSessionHeader(req);
        if (!sessionId || !transports.has(sessionId)) {
            res.status(400).send('Invalid or missing Mcp-Session-Id');
            return;
        }
        const transport = transports.get(sessionId)!;
        try {
            await transport.handleRequest(req, res);
        } catch (err) {
            console.error('[MCP] DELETE error:', err);
            if (!res.headersSent) {
                res.status(500).send('Internal server error');
            }
        }
    };

    router.post(mountPath, postHandler);
    router.get(mountPath, getHandler);
    router.delete(mountPath, deleteHandler);
}
