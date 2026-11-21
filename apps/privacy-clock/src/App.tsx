import { Navigate, Route, Routes } from 'react-router-dom';

import { AppShell } from '@x10/shared/runtime';

import { AboutPage } from './pages/AboutPage';
import { AlmanacPage } from './pages/AlmanacPage';
import { BreachPage } from './pages/BreachPage';
import { EscapementPage } from './pages/EscapementPage';
import { GearsPage } from './pages/GearsPage';
import { IntakePage } from './pages/IntakePage';
import { LogbookPage } from './pages/LogbookPage';
import { RequestPage } from './pages/RequestPage';
import { TowerPage } from './pages/TowerPage';
import { DialDefs } from './tower/Dial';

export function App() {
  return (
    <>
      <DialDefs />
      <Routes>
        <Route path="/" element={<AppShell immersive><TowerPage /></AppShell>} />
        <Route path="/intake" element={<AppShell><IntakePage /></AppShell>} />
        <Route path="/gears" element={<AppShell wide><GearsPage /></AppShell>} />
        <Route path="/escapement" element={<AppShell wide><EscapementPage /></AppShell>} />
        <Route path="/escapement/:id" element={<AppShell wide><BreachPage /></AppShell>} />
        <Route path="/requests/:id" element={<AppShell wide><RequestPage /></AppShell>} />
        <Route path="/logbook" element={<AppShell wide><LogbookPage /></AppShell>} />
        <Route path="/almanac" element={<AppShell wide><AlmanacPage /></AppShell>} />
        <Route path="/about" element={<AppShell><AboutPage /></AppShell>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
