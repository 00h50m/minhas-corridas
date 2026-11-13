import { Suspense, lazy, useEffect } from 'react'
import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { nextConfirmed } from './lib/stats.js'
import { BottomNav, UIProvider } from './components/ui.jsx'
import { useStore } from './services/store.js'
import Home from './pages/Home.jsx'
import Races from './pages/Races.jsx'
import RaceDetail from './pages/RaceDetail.jsx'
import History from './pages/History.jsx'
import Goals from './pages/Goals.jsx'
import ImportPrompt from './components/ImportPrompt.jsx'

// Telas menos usadas (e as que trazem bibliotecas grandes) carregam só quando abertas.
const RaceForm = lazy(() => import('./pages/RaceForm.jsx'))
const ResultForm = lazy(() => import('./pages/ResultForm.jsx'))
const Settings = lazy(() => import('./pages/Settings.jsx'))
const GoalForm = lazy(() => import('./pages/GoalForm.jsx'))
const GoalDetail = lazy(() => import('./pages/GoalDetail.jsx'))
const Account = lazy(() => import('./pages/Account.jsx'))
const ShareResult = lazy(() => import('./pages/ShareResult.jsx'))
const Compare = lazy(() => import('./pages/Compare.jsx'))
const Reminders = lazy(() => import('./pages/Reminders.jsx'))
const RaceDay = lazy(() => import('./pages/RaceDay.jsx'))
const Decide = lazy(() => import('./pages/Decide.jsx'))
const Profile = lazy(() => import('./pages/Profile.jsx'))
const Logistics = lazy(() => import('./pages/Logistics.jsx'))
const YearReview = lazy(() => import('./pages/YearReview.jsx'))
const Privacy = lazy(() => import('./pages/Privacy.jsx'))
const PeoplePlaces = lazy(() => import('./pages/PeoplePlaces.jsx'))
const Workouts = lazy(() => import('./pages/Workouts.jsx'))
const WorkoutForm = lazy(() => import('./pages/WorkoutForm.jsx'))
const WorkoutDetail = lazy(() => import('./pages/WorkoutDetail.jsx'))
import UpdatePrompt from './components/UpdatePrompt.jsx'

function ScrollTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])
  return null
}

export default function App() {
  const store = useStore()
  return (
    <UIProvider>
      <div className="app">
        <ScrollTop />
        {store.status === 'loading' && (
          <div className="loading"><div><div className="spinner" />Carregando suas corridas…</div></div>
        )}
        {store.status === 'error' && (
          <div className="page" style={{ paddingTop: 40 }}>
            <div className="alert alert-error" role="alert"><div><b>Não foi possível abrir seus dados.</b><br />{store.error}</div></div>
            <Link to="/ajustes" className="btn btn-dark btn-block" style={{ marginTop: 14 }}>Ir para Ajustes e restaurar backup</Link>
          </div>
        )}
        {(store.status === 'ready' || store.status === 'error') && (
          <Suspense fallback={<div className="loading"><div><div className="spinner" />Abrindo…</div></div>}>
          <Routes>
            {store.status === 'ready' && (
              <>
                <Route path="/" element={<Home />} />
                <Route path="/corridas" element={<Races />} />
                <Route path="/corridas/nova" element={<RaceForm />} />
                <Route path="/corridas/:id" element={<RaceDetail />} />
                <Route path="/corridas/:id/editar" element={<RaceForm />} />
                <Route path="/corridas/:id/resultado" element={<ResultForm />} />
                <Route path="/corridas/:id/compartilhar" element={<ShareResult />} />
                <Route path="/corridas/:id/dia" element={<RaceDay />} />
                <Route path="/corridas/:id/logistica" element={<Logistics />} />
                <Route path="/historico" element={<History />} />
                <Route path="/comparar" element={<Compare />} />
                <Route path="/decidir" element={<Decide />} />
                <Route path="/retrospectiva/:ano" element={<YearReview />} />
                <Route path="/proxima" element={<NextRace />} />
                <Route path="/objetivos" element={<Goals />} />
                <Route path="/objetivos/novo" element={<GoalForm />} />
                <Route path="/objetivos/:id" element={<GoalDetail />} />
                <Route path="/objetivos/:id/editar" element={<GoalForm key="edit" />} />
                <Route path="/treinos" element={<Workouts />} />
                <Route path="/treinos/novo" element={<WorkoutForm />} />
                <Route path="/treinos/:id" element={<WorkoutDetail />} />
                <Route path="/treinos/:id/editar" element={<WorkoutForm />} />
              </>
            )}
            <Route path="/ajustes" element={<Settings />} />
            <Route path="/conta" element={<Account />} />
            <Route path="/lembretes" element={<Reminders />} />
            <Route path="/perfil" element={<Profile />} />
            <Route path="/privacidade" element={<Privacy />} />
            <Route path="/pessoas-e-lugares" element={<PeoplePlaces />} />
            <Route path="*" element={store.status === 'ready' ? <NotFound /> : null} />
          </Routes>
          </Suspense>
        )}
      </div>
      <BottomNav />
      <ImportPrompt />
      <UpdatePrompt />
    </UIProvider>
  )
}

/** Atalho do ícone "Próxima prova": abre a próxima inscrição (ou o calendário). */
function NextRace() {
  const { races } = useStore()
  const next = nextConfirmed(races)
  return <Navigate to={next ? `/corridas/${next.id}` : '/corridas'} replace />
}

function NotFound() {
  return (
    <div className="page" style={{ paddingTop: 40 }}>
      <div className="card empty">
        <h2>Página não encontrada</h2>
        <p>Esse endereço não existe no app.</p>
        <Link to="/" className="btn btn-primary">Voltar ao início</Link>
      </div>
    </div>
  )
}
