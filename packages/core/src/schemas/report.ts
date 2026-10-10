import { z } from 'zod';

// The query of the report operation, GET /api/v1/threat-models/{id}/report. It lives here because every /api/v1
// input is validated by a shared schema in this package (constitution Principle I).
//
// A missing, unknown or repeated `format`, and any extra key, all get the one message, which names the formats and
// never repeats what the client sent. The error is set on the object as well as on the field, because an unknown key
// is reported against the object.
export const REPORT_FORMATS = ['markdown', 'html'] as const;
export type ReportFormat = (typeof REPORT_FORMATS)[number];

const MESSAGE = `format must be ${REPORT_FORMATS.join(' or ')}`;

export const ReportQuery = z.strictObject({ format: z.enum(REPORT_FORMATS, { error: MESSAGE }) }, { error: MESSAGE });
export type ReportQuery = z.infer<typeof ReportQuery>;
