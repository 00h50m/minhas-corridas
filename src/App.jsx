import { useEffect } from 'react'
import { Link, Route, Routes, useLocation } from 'react-router-dom'
import { BottomNav, UIProvider } from './components/ui.jsx'
import { useStore } from './services/store.js'
import Home from './pages/Home.jsx'
import Races from './pages/Races.jsx'
import RaceForm from './pages/RaceForm.jsx'
import RaceDetail from './pages/RaceDetail.jsx'
import ResultForm from './pages/ResultForm.jsx'
import History from './pages/History.jsx'
import Settings from './pages/Settings.jsx'

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
          <Routes>
            {store.status === 'ready' && (
              <>
                <Route path="/" element={<Home />} />
                <Route path="/corridas" element={<Races />} />
                <Route path="/corridas/nova" element={<RaceForm />} />
                <Route path="/corridas/:id" element={<RaceDetail />} />
                <Route path="/corridas/:id/editar" element={<RaceForm />} />
                <Route path="/corridas/:id/resultado" element={<ResultForm />} />
                <Route path="/historico" element={<History />} />
              </>
            )}
            <Route path="/ajustes" element={<Settings />} />
            <Route path="*" element={store.status === 'ready' ? <NotFound /> : null} />
          </Routes>
        )}
      </div>
      <BottomNav />
    </UIProvider>
  )
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
