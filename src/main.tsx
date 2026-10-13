import ReactDOM from 'react-dom/client';
import '@xterm/xterm/css/xterm.css';
import './index.css';
import App from './App';

// NOTE: React.StrictMode is intentionally omitted. Its double-invoked mount
// effects would spawn (and immediately orphan) duplicate PTY processes.
ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(<App />);
