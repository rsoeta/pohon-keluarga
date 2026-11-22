import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ThemeProvider } from './contexts/ThemeContext.jsx';
import { FontProvider } from './contexts/FontContext.jsx';
import { I18nProvider } from './contexts/I18nContext.jsx';
import { AuthProvider } from './contexts/AuthContext.jsx';
import { AdminRoute, ProtectedRoute } from './components/auth/ProtectedRoute.jsx';
import { AppShell } from './components/layout/AppShell.jsx';
import { LoginPage } from './pages/LoginPage.jsx';
import { SettingsPage } from './pages/SettingsPage.jsx';
import { TreePage } from './pages/TreePage.jsx';
import { DirectoryPage } from './pages/DirectoryPage.jsx';
import { ProfileDetailPage } from './pages/ProfileDetailPage.jsx';
import { MemberFormPage } from './pages/MemberFormPage.jsx';
import { BirthdaysPage } from './pages/BirthdaysPage.jsx';
import { AdminPanelPage } from './pages/AdminPanelPage.jsx';
import { GedcomImportPage } from './pages/GedcomImportPage.jsx';

export default function App() {
  return (
    <ThemeProvider>
      <FontProvider>
        <I18nProvider>
          <AuthProvider>
            <BrowserRouter>
              <Routes>
                <Route path="/login" element={<LoginPage />} />

                <Route element={<ProtectedRoute />}>
                  <Route element={<AppShell />}>
                    <Route index element={<Navigate to="/pohon" replace />} />
                    <Route path="/pohon" element={<TreePage />} />
                    <Route path="/daftar" element={<DirectoryPage />} />
                    <Route path="/profil/:id" element={<ProfileDetailPage />} />
                    <Route path="/tambah" element={<MemberFormPage />} />
                    <Route path="/edit/:id" element={<MemberFormPage />} />
                    <Route path="/ultah" element={<BirthdaysPage />} />
                    <Route path="/setelan" element={<SettingsPage />} />

                    <Route element={<AdminRoute />}>
                      <Route path="/admin" element={<AdminPanelPage />} />
                      <Route path="/admin/gedcom" element={<GedcomImportPage />} />
                    </Route>
                  </Route>
                </Route>

                <Route path="*" element={<Navigate to="/pohon" replace />} />
              </Routes>
            </BrowserRouter>
          </AuthProvider>
        </I18nProvider>
      </FontProvider>
    </ThemeProvider>
  );
}
