import { createRoot } from 'react-dom/client';
import '@fontsource/ibm-plex-sans/latin-400.css';
import '@fontsource/ibm-plex-sans/latin-600.css';
import '@fontsource/ibm-plex-mono/latin-400.css';
import '@fontsource/great-vibes/latin-400.css';
import '@fontsource/iceberg/latin-400.css';
import '@fontsource/audiowide/latin-400.css';
import './styles.css';
import App from './App';

createRoot(document.getElementById('root')!).render(<App />);
