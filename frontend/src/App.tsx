import React, { useState, useEffect } from 'react';
import { 
  Search, 
  Database, 
  Layers, 
  Copy, 
  Check, 
  AlertTriangle, 
  Upload, 
  Trash2, 
  CheckCircle, 
  ArrowRight, 
  HelpCircle,
  RefreshCw,
  Sparkles,
  CheckCircle2,
  FileDown
} from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_BASE || 'https://dnadv-omnicadastro.onrender.com/api';

export default function App() {
  const [activeTab, setActiveTab] = useState<'search' | 'bulk' | 'db'>('search');
  
  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResult, setSearchResult] = useState<any>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [copiedText, setCopiedText] = useState(false);

  // Bulk state
  const [bulkNames, setBulkNames] = useState('');
  const [bulkResults, setBulkResults] = useState<any[]>([]);
  const [isEnriching, setIsEnriching] = useState(false);
  const [enrichStats, setEnrichStats] = useState({ success: 0, ambiguous: 0, notFound: 0, total: 0 });

  // Database stats state
  const [dbStats, setDbStats] = useState<any>({ totalRecords: 0, samples: [] });
  const [isRefreshingStats, setIsRefreshingStats] = useState(false);
  const [localCsvPath, setLocalCsvPath] = useState('');
  const [importStatus, setImportStatus] = useState<{ loading: boolean; success?: boolean; message?: string; time?: string; count?: number }>({ loading: false });

  // Load stats on mount
  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    setIsRefreshingStats(true);
    try {
      const res = await fetch(`${API_BASE}/stats`);
      const data = await res.json();
      setDbStats(data);
    } catch (err) {
      console.error("Error fetching stats:", err);
    } finally {
      setIsRefreshingStats(false);
    }
  };

  // Perform Unit Search
  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    setIsSearching(true);
    setSearchResult(null);
    try {
      const res = await fetch(`${API_BASE}/search?q=${encodeURIComponent(searchQuery)}`);
      const data = await res.json();
      setSearchResult(data);
    } catch (err) {
      console.error("Search failed:", err);
    } finally {
      setIsSearching(false);
    }
  };

  // Perform Bulk Enrichment of pasted text names
  const handleBulkEnrich = async () => {
    const namesArray = bulkNames
      .split('\n')
      .map(name => name.trim())
      .filter(name => name.length > 0);

    if (namesArray.length === 0) return;

    setIsEnriching(true);
    setBulkResults([]);
    try {
      const res = await fetch(`${API_BASE}/enrich`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ names: namesArray })
      });
      const data = await res.json();
      setBulkResults(data.results);

      // Compute statistics
      const stats = { success: 0, ambiguous: 0, notFound: 0, total: namesArray.length };
      data.results.forEach((r: any) => {
        if (r.status === 'success') stats.success++;
        else if (r.status === 'ambiguous') stats.ambiguous++;
        else stats.notFound++;
      });
      setEnrichStats(stats);
    } catch (err) {
      console.error("Bulk enrichment failed:", err);
    } finally {
      setIsEnriching(false);
    }
  };

  // Trigger local CSV bulk import
  const handleLocalCsvImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!localCsvPath.trim()) return;

    setImportStatus({ loading: true });
    try {
      const res = await fetch(`${API_BASE}/pessoas/import-local`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filePath: localCsvPath })
      });
      const data = await res.json();
      
      if (res.ok && data.success) {
        setImportStatus({
          loading: false,
          success: true,
          message: data.message,
          count: data.totalInserted,
          time: data.elapsedSeconds
        });
        fetchStats(); // update stats
      } else {
        setImportStatus({
          loading: false,
          success: false,
          message: data.error || 'Erro desconhecido ao importar arquivo.'
        });
      }
    } catch (err: any) {
      setImportStatus({
        loading: false,
        success: false,
        message: err.message || 'Falha ao conectar com o servidor.'
      });
    }
  };

  // Truncate DB Table
  const handleClearDb = async () => {
    if (!window.confirm("ATENÇÃO: Isso irá deletar TODOS os registros de nomes e CPFs do banco de dados. Tem certeza?")) {
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/pessoas/clear`, { method: 'POST' });
      if (res.ok) {
        alert("Banco de dados esvaziado com sucesso!");
        fetchStats();
      }
    } catch (err) {
      console.error("Error clearing DB:", err);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(true);
    setTimeout(() => setCopiedText(false), 2000);
  };

  // Export Enriched results to CSV file
  const exportBulkToCsv = () => {
    if (bulkResults.length === 0) return;

    // Header
    let csvContent = "data:text/csv;charset=utf-8,Nome Original;Nome Encontrado;CPF Enriquecido;Status;Outras Opcoes Possiveis\n";
    
    // Rows
    bulkResults.forEach(r => {
      const orig = r.originalName.replace(/"/g, '""');
      const found = (r.enrichedName || "").replace(/"/g, '""');
      const cpf = r.cpf || "";
      const status = r.status.toUpperCase();
      const alts = r.alternates.join(" | ").replace(/"/g, '""');
      csvContent += `"${orig}";"${found}";"${cpf}";"${status}";"${alts}"\n`;
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "dados_enriquecidos.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="app-container">
      {/* Glow circles behind elements */}
      <div className="glow-container">
        <div className="glow-circle glow-1"></div>
        <div className="glow-circle glow-2"></div>
      </div>

      {/* Header */}
      <header>
        <div className="logo-section">
          <h1>
            <Sparkles size={28} style={{ color: 'hsl(var(--primary))' }} />
            ADVBox Enrichment DB
          </h1>
          <p>Motor inteligente de busca de CPFs por abreviações e tolerância a erros</p>
        </div>

        {/* Tab Controls */}
        <nav className="nav-tabs" id="main-navigation">
          <button 
            className={`tab-btn ${activeTab === 'search' ? 'active' : ''}`}
            onClick={() => setActiveTab('search')}
            id="tab-search"
          >
            <Search size={16} />
            Busca Inteligente
          </button>
          <button 
            className={`tab-btn ${activeTab === 'bulk' ? 'active' : ''}`}
            onClick={() => setActiveTab('bulk')}
            id="tab-bulk"
          >
            <Layers size={16} />
            Enriquecer em Lote
          </button>
          <button 
            className={`tab-btn ${activeTab === 'db' ? 'active' : ''}`}
            onClick={() => setActiveTab('db')}
            id="tab-db"
          >
            <Database size={16} />
            Base ({dbStats.totalRecords.toLocaleString('pt-BR')})
          </button>
        </nav>
      </header>

      {/* MAIN CONTENT CARD */}
      <main className="main-card">
        
        {/* TAB 1: SEARCH */}
        {activeTab === 'search' && (
          <div>
            <form onSubmit={handleSearch} className="search-box-wrapper">
              <input 
                type="text" 
                className="search-input"
                placeholder="Busque por variações ou abreviações... Ex: Marcelo M dos Santos" 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                id="search-input-field"
              />
              <Search className="search-icon-inside" size={22} />
              <button 
                type="submit" 
                className="btn-primary" 
                style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', padding: '0.5rem 1.25rem', fontSize: '0.9rem' }}
                disabled={isSearching}
              >
                {isSearching ? <RefreshCw className="animate-spin" size={16} /> : 'Buscar'}
              </button>
            </form>

            {isSearching && (
              <div style={{ textAlign: 'center', padding: '3rem' }}>
                <RefreshCw size={40} className="animate-spin" style={{ color: 'hsl(var(--primary))', margin: '0 auto 1rem' }} />
                <p style={{ color: 'hsl(var(--text-secondary))' }}>Vasculhando mais de 590 mil CPFs...</p>
              </div>
            )}

            {!isSearching && searchResult && (
              <div>
                {/* Case 1: Match Found */}
                {searchResult.primaryMatch ? (
                  <div className="result-grid">
                    
                    {/* Left Column: Principal Match Details */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                      {/* AMBIGUITY ALERTER */}
                      {searchResult.isAmbiguous && (
                        <div className="alert-banner" id="ambiguity-alert-banner">
                          <AlertTriangle size={24} />
                          <div>
                            <div className="alert-heading">⚠️ Alerta de Ambiguidade de Nome</div>
                            Existem múltiplos CPFs associados a nomes compatíveis com esta abreviação.
                            Confira as opções alternativas na coluna lateral para garantir a precisão.
                          </div>
                        </div>
                      )}

                      <div className="primary-match-card">
                        <div>
                          <div className="card-title-sm">Resultado Principal</div>
                          <div className="full-name">{searchResult.primaryMatch.nome}</div>
                        </div>

                        <div>
                          <div className="card-title-sm">CPF Correspondente</div>
                          <div className="cpf-badge-container" style={{ marginTop: '0.5rem' }}>
                            <div className="cpf-badge" id="enriched-cpf-value">{searchResult.primaryMatch.cpf}</div>
                            <button 
                              className="copy-btn" 
                              onClick={() => copyToClipboard(searchResult.primaryMatch.cpf)}
                              title="Copiar CPF"
                            >
                              {copiedText ? <Check size={18} /> : <Copy size={18} />}
                            </button>
                          </div>
                        </div>

                        <div style={{ display: 'flex', gap: '2rem', marginTop: '0.5rem', borderTop: '1px solid hsl(var(--border-color))', paddingTop: '1rem' }}>
                          <div>
                            <div className="card-title-sm" style={{ fontSize: '0.75rem' }}>Grau de Confiança</div>
                            <div style={{ fontSize: '1.15rem', fontWeight: '800', color: searchResult.primaryMatch.score >= 0.95 ? 'hsl(var(--success))' : 'hsl(var(--warning))', marginTop: '0.2rem' }}>
                              {(searchResult.primaryMatch.score * 100).toFixed(1)}%
                            </div>
                          </div>
                          <div>
                            <div className="card-title-sm" style={{ fontSize: '0.75rem' }}>Filtro Aplicado</div>
                            <div style={{ fontSize: '0.9rem', color: 'hsl(var(--text-secondary))', marginTop: '0.2rem', fontWeight: '600' }}>
                              FTS + Ordenação de Iniciais
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Explanation Matrix */}
                      <div className="explanation-card">
                        <div className="card-title-sm">Análise de Correspondência de Tokens</div>
                        
                        <div className="explanation-timeline">
                          {searchResult.primaryMatch.explanation.map((exp: any, idx: number) => (
                            <div key={idx} className="explanation-node">
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                <span className="token-pill token-query">{exp.queryToken}</span>
                                <span className="token-arrow"><ArrowRight size={14} /></span>
                                <span className="token-pill token-target">{exp.targetToken}</span>
                              </div>
                              <span className={`match-type-tag tag-${exp.type}`}>
                                {exp.type === 'exact' ? 'Exato' : exp.type === 'abbreviation' ? 'Inicial' : 'Fuzzy'}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Right Column: Alternate Candidates */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                      <div className="explanation-card" style={{ height: '100%' }}>
                        <div className="card-title-sm" style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                          <span>Outras Opções Possíveis</span>
                          <span style={{ background: 'rgba(255,255,255,0.05)', padding: '0.1rem 0.5rem', borderRadius: '4px' }}>
                            {searchResult.alternates.length} encontrada(s)
                          </span>
                        </div>
                        
                        {searchResult.alternates.length === 0 ? (
                          <div style={{ color: 'hsl(var(--text-muted))', textAlign: 'center', margin: 'auto 0', padding: '2rem 0' }}>
                            <CheckCircle2 size={36} style={{ color: 'hsl(var(--success))', opacity: 0.5, margin: '0 auto 1rem' }} />
                            Nenhum outro nome compatível na base.
                          </div>
                        ) : (
                          <div className="alternatives-container">
                            <p style={{ fontSize: '0.8rem', color: 'hsl(var(--text-secondary))', marginBottom: '0.5rem' }}>
                              Estes nomes também se alinham com a pesquisa e possuem pontuações próximas:
                            </p>
                            {searchResult.alternates.map((alt: any, idx: number) => (
                              <div key={idx} className="alternative-row">
                                <div>
                                  <div className="alt-name">{alt.nome}</div>
                                  <div style={{ fontSize: '0.75rem', color: 'hsl(var(--text-muted))', marginTop: '0.2rem' }}>
                                    Match: {(alt.score * 100).toFixed(0)}% • {alt.explanation.filter((e: any) => e.type === 'abbreviation').length} abreviação
                                  </div>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                  <span className="alt-cpf">{alt.cpf}</span>
                                  <button 
                                    className="copy-btn" 
                                    style={{ padding: '0.4rem', borderRadius: '6px' }}
                                    onClick={() => copyToClipboard(alt.cpf)}
                                    title="Copiar CPF"
                                  >
                                    <Copy size={12} />
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                  </div>
                ) : (
                  /* Case 2: No Matches Found */
                  <div style={{ textAlign: 'center', padding: '4rem 2rem', background: 'rgba(255,255,255,0.01)', border: '1px dashed hsl(var(--border-color))', borderRadius: '16px' }}>
                    <HelpCircle size={48} style={{ color: 'hsl(var(--text-muted))', margin: '0 auto 1.5rem' }} />
                    <h3 style={{ fontSize: '1.25rem', marginBottom: '0.5rem' }}>Nenhum CPF correspondente encontrado</h3>
                    <p style={{ color: 'hsl(var(--text-secondary))', maxWidth: '450px', margin: '0 auto' }}>
                      Não encontramos nenhuma pessoa na base que corresponda visualmente ou foneticamente à busca "{searchQuery}". 
                      Verifique a grafia ou cadastre o registro na aba "Base".
                    </p>
                  </div>
                )}
              </div>
            )}

            {!searchResult && !isSearching && (
              <div style={{ textAlign: 'center', padding: '5rem 2rem', color: 'hsl(var(--text-secondary))' }}>
                <Search size={48} style={{ opacity: 0.25, margin: '0 auto 1.5rem' }} />
                <h3 style={{ fontFamily: 'var(--font-title)', fontSize: '1.35rem', fontWeight: 600, color: '#fff', marginBottom: '0.5rem' }}>
                  Pronto para Enriquecimento
                </h3>
                <p style={{ maxWidth: '500px', margin: '0 auto 1.5rem', fontSize: '0.95rem' }}>
                  Digite qualquer combinação de primeiro nome, iniciais do meio e sobrenome para buscar instantaneamente na base de quase 600 mil registros do Supabase.
                </p>
                <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                  <button onClick={() => setSearchQuery('Marcelo M dos Santos')} className="btn-secondary" style={{ fontSize: '0.8rem' }}>Exemplo: Marcelo M dos Santos</button>
                  <button onClick={() => setSearchQuery('Marcelo Mesquita')} className="btn-secondary" style={{ fontSize: '0.8rem' }}>Exemplo: Marcelo Mesquita</button>
                  <button onClick={() => setSearchQuery('Marcello Santos')} className="btn-secondary" style={{ fontSize: '0.8rem' }}>Exemplo: Marcello Santos (Typo)</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: BULK ENRICHER */}
        {activeTab === 'bulk' && (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '2rem' }}>
              
              {/* Input Area */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                <div>
                  <h3 style={{ fontFamily: 'var(--font-title)', fontSize: '1.15rem', marginBottom: '0.5rem' }}>Lista de Entrada</h3>
                  <p style={{ color: 'hsl(var(--text-muted))', fontSize: '0.85rem', marginBottom: '1rem' }}>
                    Cole uma lista de nomes com variações/abreviações (um por linha) para enriquecer em massa.
                  </p>
                  <textarea 
                    className="text-input-premium"
                    style={{ width: '100%', height: '350px', resize: 'none', fontFamily: 'var(--font-body)', fontSize: '0.9rem', lineHeight: '1.4' }}
                    placeholder="Cole os nomes aqui, ex:&#10;Marcelo M dos Santos&#10;Marcelo Santos&#10;Maria M Santos&#10;Ana S Silva"
                    value={bulkNames}
                    onChange={(e) => setBulkNames(e.target.value)}
                    disabled={isEnriching}
                  />
                </div>

                <button 
                  className="btn-primary" 
                  style={{ width: '100%', justifyContent: 'center', padding: '0.9rem' }}
                  onClick={handleBulkEnrich}
                  disabled={isEnriching || !bulkNames.trim()}
                >
                  {isEnriching ? (
                    <>
                      <RefreshCw className="animate-spin" size={18} />
                      Cruzando dados...
                    </>
                  ) : (
                    <>
                      <Sparkles size={18} />
                      Enriquecer Nomes ({bulkNames.split('\n').filter(n=>n.trim()).length})
                    </>
                  )}
                </button>
              </div>

              {/* Output Results Table */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3 style={{ fontFamily: 'var(--font-title)', fontSize: '1.15rem' }}>Resultado do Enriquecimento</h3>
                  {bulkResults.length > 0 && (
                    <button onClick={exportBulkToCsv} className="btn-secondary" style={{ fontSize: '0.85rem', padding: '0.4rem 0.8rem' }}>
                      <FileDown size={14} />
                      Baixar Planilha CSV
                    </button>
                  )}
                </div>

                {bulkResults.length === 0 ? (
                  <div style={{ border: '1px dashed hsl(var(--border-color))', borderRadius: '16px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '430px', color: 'hsl(var(--text-muted))', textAlign: 'center', padding: '2rem' }}>
                    <Layers size={40} style={{ opacity: 0.3, marginBottom: '1rem' }} />
                    <p style={{ maxWidth: '300px', fontSize: '0.9rem' }}>
                      Insira os nomes na caixa de texto à esquerda e dispare o enriquecedor para processar e gerar a planilha de CPFs.
                    </p>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    
                    {/* Performance metrics banner */}
                    <div className="stats-grid" style={{ margin: 0 }}>
                      <div className="stat-item" style={{ borderColor: 'hsl(var(--success) / 30%)', background: 'hsl(var(--success) / 3%)' }}>
                        <div className="stat-value" style={{ color: 'hsl(var(--success))' }}>{enrichStats.success}</div>
                        <div className="stat-label">Sucesso Total</div>
                      </div>
                      <div className="stat-item" style={{ borderColor: 'hsl(var(--warning) / 30%)', background: 'hsl(var(--warning) / 3%)' }}>
                        <div className="stat-value" style={{ color: 'hsl(var(--warning))' }}>{enrichStats.ambiguous}</div>
                        <div className="stat-label">Ambiguidades</div>
                      </div>
                      <div className="stat-item" style={{ borderColor: 'hsl(var(--danger) / 30%)', background: 'hsl(var(--danger) / 3%)' }}>
                        <div className="stat-value" style={{ color: 'hsl(var(--danger))' }}>{enrichStats.notFound}</div>
                        <div className="stat-label">Não Encontrados</div>
                      </div>
                      <div className="stat-item">
                        <div className="stat-value">{((enrichStats.success + enrichStats.ambiguous) / enrichStats.total * 100).toFixed(0)}%</div>
                        <div className="stat-label">Aproveitamento</div>
                      </div>
                    </div>

                    {/* Results Table */}
                    <div className="table-wrapper" style={{ maxHeight: '310px', overflowY: 'auto' }}>
                      <table>
                        <thead>
                          <tr>
                            <th>Nome Pesquisado</th>
                            <th>Cadastro Encontrado</th>
                            <th>CPF Enriquecido</th>
                            <th>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {bulkResults.map((r, idx) => (
                            <tr key={idx}>
                              <td style={{ fontWeight: 500 }}>{r.originalName}</td>
                              <td>{r.enrichedName || <span style={{ color: 'hsl(var(--text-muted))' }}>-</span>}</td>
                              <td style={{ fontFamily: 'monospace', fontWeight: 600, color: r.cpf ? 'hsl(var(--success))' : 'inherit' }}>
                                {r.cpf || '-'}
                              </td>
                              <td>
                                <span className={`status-badge status-${r.status}`}>
                                  {r.status === 'success' ? 'Sucesso' : r.status === 'ambiguous' ? 'Ambíguo' : 'Ausente'}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>

            </div>
          </div>
        )}

        {/* TAB 3: DB DATABASE SETTINGS */}
        {activeTab === 'db' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            
            {/* Stats Dashboard Row */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ fontFamily: 'var(--font-title)', fontSize: '1.35rem', fontWeight: 700 }}>Estatísticas da Base no Supabase</h3>
                <p style={{ color: 'hsl(var(--text-secondary))', fontSize: '0.9rem', marginTop: '0.2rem' }}>
                  Conectado ao PostgreSQL hospedado em nuvem
                </p>
              </div>

              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button onClick={fetchStats} className="btn-secondary" disabled={isRefreshingStats}>
                  <RefreshCw className={isRefreshingStats ? 'animate-spin' : ''} size={16} />
                  Atualizar Contadores
                </button>
                <button onClick={handleClearDb} className="btn-secondary" style={{ color: 'hsl(var(--danger))', borderColor: 'hsl(var(--danger) / 30%)' }}>
                  <Trash2 size={16} />
                  Zerar Tabela
                </button>
              </div>
            </div>

            <div className="stats-grid">
              <div className="stat-item" style={{ padding: '1.5rem' }}>
                <div className="stat-value" style={{ fontSize: '2.25rem', color: 'hsl(var(--primary))' }}>
                  {dbStats.totalRecords.toLocaleString('pt-BR')}
                </div>
                <div className="stat-label">Total de Registros Carregados</div>
              </div>
              <div className="stat-item" style={{ padding: '1.5rem' }}>
                <div className="stat-value" style={{ fontSize: '2.25rem', color: 'hsl(var(--success))' }}>Ativo</div>
                <div className="stat-label">Índice GIN (Busca FTS)</div>
              </div>
              <div className="stat-item" style={{ padding: '1.5rem' }}>
                <div className="stat-value" style={{ fontSize: '2.25rem' }}>Postgres</div>
                <div className="stat-label">Motor de Armazenamento</div>
              </div>
              <div className="stat-item" style={{ padding: '1.5rem' }}>
                <div className="stat-value" style={{ fontSize: '2.25rem' }}>&lt; 10ms</div>
                <div className="stat-label">Latência Média de Indexação</div>
              </div>
            </div>

            {/* Bulk CSV Import Panel */}
            <div className="config-box">
              <div className="config-title">
                <Upload size={20} style={{ color: 'hsl(var(--primary))' }} />
                Importação Local do Arquivo de 600 mil CPFs
              </div>

              <p style={{ color: 'hsl(var(--text-secondary))', fontSize: '0.9rem', lineHeight: '1.5' }}>
                Devido ao tamanho colossal da base (599.571 registros), carregar o arquivo arrastando no navegador pode estourar os limites de memória ou conexão. 
                Para máxima eficiência, o servidor Express pode <strong>ler e transmitir o arquivo diretamente do seu disco local</strong> (streaming em lotes de 5.000).
              </p>

              <form onSubmit={handleLocalCsvImport} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', marginTop: '0.5rem' }}>
                <div className="form-group">
                  <label htmlFor="csv-path-input">Caminho Absoluto do CSV no seu Computador</label>
                  <input 
                    type="text" 
                    id="csv-path-input"
                    className="text-input-premium"
                    placeholder="Ex: C:/Users/Downloads/lista_cpfs.csv"
                    value={localCsvPath}
                    onChange={(e) => setLocalCsvPath(e.target.value)}
                    disabled={importStatus.loading}
                  />
                  <span style={{ fontSize: '0.75rem', color: 'hsl(var(--text-muted))' }}>
                    O arquivo CSV deve conter cabeçalhos como "nome" e "cpf", e utilizar ponto e vírgula (;) ou vírgula (,) como separador.
                  </span>
                </div>

                <button 
                  type="submit" 
                  className="btn-primary" 
                  style={{ width: 'fit-content' }}
                  disabled={importStatus.loading || !localCsvPath.trim()}
                >
                  {importStatus.loading ? (
                    <>
                      <RefreshCw className="animate-spin" size={16} />
                      Processando e normalizando base (Lotes de 5k)...
                    </>
                  ) : (
                    <>
                      <Upload size={16} />
                      Iniciar Carga Massiva
                    </>
                  )}
                </button>
              </form>

              {/* Import status alerts */}
              {importStatus.loading && (
                <div className="alert-banner" style={{ background: 'hsl(var(--primary) / 10%)', borderColor: 'hsl(var(--primary) / 30%)', color: '#fff', margin: 0 }}>
                  <RefreshCw className="animate-spin" size={20} />
                  <div>
                    <div className="alert-heading">Importação em Andamento...</div>
                    Transmitindo dados em blocos para o Supabase. Por favor, mantenha o console do servidor Express aberto para acompanhar a barra de progresso linha a linha.
                  </div>
                </div>
              )}

              {importStatus.success === true && (
                <div className="alert-banner" style={{ background: 'hsl(var(--success) / 10%)', borderColor: 'hsl(var(--success) / 30%)', color: 'hsl(var(--success))', margin: 0 }}>
                  <CheckCircle size={20} />
                  <div>
                    <div className="alert-heading">Carga Concluída com Sucesso!</div>
                    {importStatus.message} Todos os dados foram normalizados e o índice GIN de correspondência rápida está ativo.
                  </div>
                </div>
              )}

              {importStatus.success === false && (
                <div className="alert-banner" style={{ background: 'hsl(var(--danger) / 10%)', borderColor: 'hsl(var(--danger) / 30%)', color: 'hsl(var(--danger))', margin: 0 }}>
                  <AlertTriangle size={20} />
                  <div>
                    <div className="alert-heading">Falha na Importação</div>
                    {importStatus.message}
                  </div>
                </div>
              )}
            </div>

            {/* Database Sample Records Tbl */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <h4 style={{ fontFamily: 'var(--font-title)', fontSize: '1.1rem' }}>Amostra da Base Atual (Primeiras 5 Linhas)</h4>
              <div className="table-wrapper">
                <table>
                  <thead>
                    <tr>
                      <th>Nome Completo</th>
                      <th>CPF</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dbStats.samples && dbStats.samples.length > 0 ? (
                      dbStats.samples.map((s: any, idx: number) => (
                        <tr key={idx}>
                          <td style={{ fontWeight: 600 }}>{s.nome}</td>
                          <td style={{ fontFamily: 'monospace', color: 'hsl(var(--success))', fontWeight: 600 }}>{s.cpf}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={2} style={{ textAlign: 'center', padding: '2rem', color: 'hsl(var(--text-muted))' }}>
                          Nenhum registro carregado no banco de dados ainda. Use a caixa de carga acima!
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        )}

      </main>

      {/* Footer */}
      <footer>
        <p>© 2026 ADVBox Data Enrichment Engine • Desenvolvido com React + Supabase Postgres + Render</p>
      </footer>
    </div>
  );
}
