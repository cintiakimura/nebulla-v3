import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [
      react(),
      tailwindcss(),
      {
        name: 'html-transform',
        transformIndexHtml(html) {
          const script = `
    <script>
      (function() {
        const isViteError = (msg) =>
          msg && (
            msg.includes('WebSocket') ||
            msg.includes('vite') ||
            msg.includes('hmr') ||
            msg.includes('ScriptProcessorNode') ||
            msg.includes('service-worker') ||
            msg.includes('Service Worker') ||
            msg.includes('Failed to fetch') ||
            msg.includes('WebSocketInterceptor') ||
            msg.includes('Global WebSocket constructor') ||
            msg.includes('ScriptProcessorNode is deprecated') ||
            msg.includes('listener indicated an asynchronous response') ||
            msg.includes('message channel closed before a response was received') ||
            msg.includes('token=') ||
            msg.includes('Canceled: Canceled') ||
            msg.includes('blobstore') ||
            msg.includes('makersuite')
          );

        const OriginalWebSocket = window.WebSocket;
        window.WebSocket = function(url, protocols) {
          if (typeof url === 'string' && (url.includes('vite') || url.includes('hmr') || url.includes('token='))) {
            return {
              readyState: 3,
              close: function() {},
              send: function() {},
              addEventListener: function() {},
              removeEventListener: function() {},
              onopen: null,
              onclose: null,
              onerror: null,
              onmessage: null
            };
          }
          try {
            return new OriginalWebSocket(url, protocols);
          } catch (e) {
            return {};
          }
        };
        window.WebSocket.prototype = OriginalWebSocket.prototype;

        window.addEventListener('unhandledrejection', (event) => {
          const reason = event.reason;
          const msg = (reason && (reason.message || reason.stack || String(reason))) || '';
          if (isViteError(msg)) {
            event.preventDefault();
            event.stopPropagation();
          }
        }, true);

        window.addEventListener('error', (event) => {
          const msg = event.message || '';
          if (isViteError(msg)) {
            event.preventDefault();
            event.stopPropagation();
          }
        }, true);

        const originalConsoleError = console.error;
        console.error = function() {
          const args = Array.from(arguments);
          const msg = args.join(' ');
          if (isViteError(msg)) return;
          originalConsoleError.apply(console, arguments);
        };

        const originalConsoleWarn = console.warn;
        console.warn = function() {
          const args = Array.from(arguments);
          const msg = args.join(' ');
          if (isViteError(msg)) return;
          originalConsoleWarn.apply(console, arguments);
        };

        const originalConsoleLog = console.log;
        console.log = function() {
          const args = Array.from(arguments);
          const msg = args.join(' ');
          if (isViteError(msg)) return;
          originalConsoleLog.apply(console, arguments);
        };
      })();
    </script>`;
          return html.replace('<head>', '<head>' + script);
        },
      },
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    define: {
      'process.env.SUPABASE_URL': JSON.stringify(env.SUPABASE_URL ?? ''),
      'process.env.SUPABASE_ANON_KEY': JSON.stringify(env.SUPABASE_ANON_KEY ?? ''),
    },
    server: {
      hmr: {
        overlay: false,
      },
    },
  };
});
