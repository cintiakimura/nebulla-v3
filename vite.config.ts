import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
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
      // Aggressively silence Vite WebSocket/HMR errors in AI Studio
      (function() {
        const isViteError = (msg) => 
          msg && (
            msg.includes('WebSocket') || 
            msg.includes('vite') ||
            msg.includes('hmr') ||
            msg.includes('ScriptProcessorNode') ||
            msg.includes('service-worker') ||
            msg.includes('Failed to fetch')
          );

        // 1. Monkey-patch WebSocket to block Vite HMR attempts
        const OriginalWebSocket = window.WebSocket;
        window.WebSocket = function(url, protocols) {
          if (typeof url === 'string' && (url.includes('vite') || url.includes('hmr'))) {
            // Return a mock object that fails silently
            return {
              readyState: 3, // CLOSED
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
            return {}; // Fallback for invalid URLs
          }
        };
        window.WebSocket.prototype = OriginalWebSocket.prototype;

        // 2. Global rejection handler
        window.addEventListener('unhandledrejection', (event) => {
          const reason = event.reason;
          const msg = (reason && (reason.message || reason.stack || String(reason))) || '';
          if (isViteError(msg)) {
            event.preventDefault();
            event.stopPropagation();
          }
        }, true);

        // 3. Global error handler
        window.addEventListener('error', (event) => {
          const msg = event.message || '';
          if (isViteError(msg)) {
            event.preventDefault();
            event.stopPropagation();
          }
        }, true);

        // 4. Silence console errors and warnings from Vite/Deprecations
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
      })();
    </script>`;
          return html.replace('<head>', '<head>' + script);
        }
      }
    ],
    define: {
      'process.env.GROK_API_KEY': JSON.stringify(env.GROK_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: {
        overlay: false,
      },
    },
  };
});
