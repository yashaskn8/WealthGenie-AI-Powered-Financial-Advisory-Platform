import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { trace, propagation } from '@opentelemetry/api';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../..');
const TRACE_LOG_PATH = path.join(ROOT_DIR, 'traces.jsonl');

/**
 * Custom FileSpanExporter that appends OpenTelemetry spans to traces.jsonl
 */
class FileSpanExporter {
  constructor(filePath = TRACE_LOG_PATH) {
    this.filePath = filePath;
  }

  export(spans, resultCallback) {
    try {
      const records = spans.map(span => {
        const traceId = span.spanContext().traceId;
        const spanId = span.spanContext().spanId;
        const parentSpanId = span.parentSpanId || null;
        const durationNano = span.duration[0] * 1e9 + span.duration[1];
        const durationMs = Number((durationNano / 1e6).toFixed(2));

        return JSON.stringify({
          service: 'wealthgenie-express',
          trace_id: traceId,
          span_id: spanId,
          parent_span_id: parentSpanId,
          name: span.name,
          duration_ms: durationMs,
          status: span.status.code === 1 ? 'OK' : (span.status.code === 2 ? 'ERROR' : 'UNSET'),
          timestamp: new Date(span.startTime[0] * 1000 + span.startTime[1] / 1e6).toISOString(),
          attributes: span.attributes || {},
        });
      });

      if (records.length > 0) {
        fs.appendFileSync(this.filePath, records.join('\n') + '\n', 'utf8');
      }
      resultCallback({ code: 0 }); // ExportResultCode.SUCCESS
    } catch (err) {
      console.warn('[Tracing] Failed to export spans to file:', err.message);
      resultCallback({ code: 1, error: err }); // ExportResultCode.FAILED
    }
  }

  shutdown() {
    return Promise.resolve();
  }
}

const fileExporter = new FileSpanExporter();

const sdk = new NodeSDK({
  serviceName: 'wealthgenie-express',
  spanProcessor: new SimpleSpanProcessor(fileExporter),
  instrumentations: [
    getNodeAutoInstrumentations({
      '@opentelemetry/instrumentation-fs': { enabled: false },
      '@opentelemetry/instrumentation-dns': { enabled: false },
      '@opentelemetry/instrumentation-net': { enabled: false },
    }),
  ],
});

sdk.start();

export { trace, propagation, TRACE_LOG_PATH };
export default sdk;
