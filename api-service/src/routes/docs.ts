import { Router } from 'express';
import swaggerUi from 'swagger-ui-express';
import { openApiDocument } from '../openapi/spec';

const router = Router();

const swaggerOptions: swaggerUi.SwaggerUiOptions = {
    customSiteTitle: 'PDF API — Swagger UI',
    swaggerOptions: {
        persistAuthorization: true,
        tryItOutEnabled: true,
        displayRequestDuration: true,
        docExpansion: 'list',
        filter: true,
        syntaxHighlight: { activate: true },
    },
};

router.use('/', swaggerUi.serve);
router.get('/', swaggerUi.setup(openApiDocument as unknown as Record<string, unknown>, swaggerOptions));

export default router;
