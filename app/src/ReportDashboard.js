import React, { useState, useEffect } from 'react';

const ReportDashboard = ({ onClose }) => {
    const [report, setReport] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        fetch('http://localhost:5000/api/report')
            .then(res => {
                if (!res.ok) throw new Error('Report not generated yet.');
                return res.json();
            })
            .then(data => {
                setReport(data);
                setLoading(false);
            })
            .catch(err => {
                setError(err.message);
                setLoading(false);
            });
    }, []);

    const styles = {
        overlay: {
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            backgroundColor: 'rgba(5, 12, 23, 0.85)',
            backdropFilter: 'blur(12px)',
            zIndex: 9999,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            padding: '40px',
            fontFamily: '"Inter", "Outfit", "Segoe UI", sans-serif',
            color: '#e2e8f0',
            animation: 'fadeIn 0.3s ease-out',
            overflowY: 'auto'
        },
        container: {
            width: '100%',
            maxWidth: '1000px',
            background: 'linear-gradient(145deg, #0e172a 0%, #080f1e 100%)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '24px',
            boxShadow: '0 20px 40px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255, 255, 255, 0.05)',
            padding: '40px',
            position: 'relative',
            margin: 'auto'
        },
        header: {
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
            paddingBottom: '20px',
            marginBottom: '30px'
        },
        title: {
            margin: 0,
            fontSize: '28px',
            fontWeight: 700,
            background: 'linear-gradient(to right, #60a5fa, #c084fc)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            letterSpacing: '-0.5px'
        },
        closeButton: {
            background: 'rgba(255, 255, 255, 0.05)',
            border: 'none',
            color: '#94a3b8',
            fontSize: '14px',
            padding: '8px 16px',
            borderRadius: '20px',
            cursor: 'pointer',
            transition: 'all 0.2s',
            fontWeight: 600,
        },
        metricsGrid: {
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: '20px',
            marginBottom: '40px'
        },
        metricCard: {
            background: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid rgba(255, 255, 255, 0.05)',
            borderRadius: '16px',
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'transform 0.2s',
        },
        metricValue: {
            fontSize: '36px',
            fontWeight: 800,
            margin: '0 0 8px 0',
            color: '#f8fafc'
        },
        metricLabel: {
            fontSize: '12px',
            textTransform: 'uppercase',
            letterSpacing: '1px',
            color: '#64748b',
            fontWeight: 600
        },
        testList: {
            display: 'flex',
            flexDirection: 'column',
            gap: '16px'
        },
        testRow: {
            background: 'rgba(255, 255, 255, 0.02)',
            border: '1px solid rgba(255, 255, 255, 0.04)',
            borderRadius: '12px',
            padding: '20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            transition: 'background 0.2s'
        },
        badge: (status) => ({
            padding: '4px 10px',
            borderRadius: '20px',
            fontSize: '11px',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '1px',
            background: status === 'pass' ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
            color: status === 'pass' ? '#4ade80' : '#f87171',
            border: `1px solid ${status === 'pass' ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`
        }),
        testName: {
            fontSize: '16px',
            fontWeight: 600,
            color: '#f1f5f9',
            display: 'flex',
            alignItems: 'center',
            gap: '12px'
        },
        testMeta: {
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            fontSize: '13px',
            color: '#94a3b8'
        },
        turnsSummary: {
            marginTop: '16px',
            padding: '16px',
            background: 'rgba(0, 0, 0, 0.2)',
            borderRadius: '8px',
            borderLeft: '2px solid rgba(255, 255, 255, 0.1)'
        },
        turnRow: {
            display: 'flex',
            marginBottom: '12px',
            fontSize: '13px',
            paddingBottom: '12px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.03)'
        },
        turnScore: {
            display: 'inline-block',
            padding: '2px 6px',
            borderRadius: '4px',
            background: 'rgba(255, 255, 255, 0.1)',
            marginLeft: '8px',
            fontSize: '11px'
        }
    };

    if (loading) {
        return (
            <div style={styles.overlay}>
                <div style={{ ...styles.container, textAlign: 'center', padding: '100px' }}>
                    <h2 style={{ color: '#60a5fa' }}>Loading Verification Results...</h2>
                </div>
            </div>
        );
    }

    if (error || !report) {
        return (
            <div style={styles.overlay}>
                <div style={{ ...styles.container, textAlign: 'center', padding: '100px' }}>
                    <h2 style={{ color: '#f87171' }}>Report Not Found</h2>
                    <p style={{ color: '#94a3b8' }}>Please execute the E2E verification nodes via the GitHub Actions runner or locally via terminal to generate latest outputs.</p>
                    <button style={{ ...styles.closeButton, marginTop: '24px' }} onClick={onClose}>Close Dashboard</button>
                </div>
            </div>
        );
    }

    const { summary, results } = report;

    return (
        <div style={styles.overlay}>
            <style dangerouslySetInnerHTML={{
                __html: `
          @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
          .report-btn-hover:hover { background: rgba(255, 255, 255, 0.1) !important; color: white !important; }
        `}} />
            <div style={styles.container}>
                <div style={styles.header}>
                    <h2 style={styles.title}>E2E Conversational Intelligence Report</h2>
                    <button style={styles.closeButton} className="report-btn-hover" onClick={onClose}>
                        Back to Application
                    </button>
                </div>

                <div style={styles.metricsGrid}>
                    <div style={styles.metricCard}>
                        <p style={styles.metricValue}>{summary.pass_rate}</p>
                        <p style={styles.metricLabel}>Pass Rate</p>
                    </div>
                    <div style={styles.metricCard}>
                        <p style={styles.metricValue}>{summary.passed}</p>
                        <p style={{ ...styles.metricLabel, color: '#4ade80' }}>Passed Nodes</p>
                    </div>
                    <div style={styles.metricCard}>
                        <p style={styles.metricValue}>{summary.failed}</p>
                        <p style={{ ...styles.metricLabel, color: '#f87171' }}>Failed Nodes</p>
                    </div>
                    <div style={styles.metricCard}>
                        <p style={styles.metricValue}>{(summary.duration_ms / 1000).toFixed(1)}s</p>
                        <p style={styles.metricLabel}>Total Execution Time</p>
                    </div>
                </div>

                <h3 style={{ fontSize: '18px', color: '#e2e8f0', marginBottom: '16px' }}>Execution Drilldown</h3>
                <div style={styles.testList}>
                    {results.map((test, idx) => (
                        <div key={idx} style={{ display: 'flex', flexDirection: 'column' }}>
                            <div style={styles.testRow}>
                                <div style={styles.testName}>
                                    <span style={styles.badge(test.status)}>{test.status}</span>
                                    {test.test_id}
                                    {test.expected_fail && test.status === 'pass' && (
                                        <span style={{ fontSize: '10px', color: '#94a3b8', background: 'rgba(255,255,255,0.05)', padding: '2px 8px', borderRadius: '4px', marginLeft: '8px' }}>
                                            Regression Verified
                                        </span>
                                    )}
                                </div>
                                <div style={styles.testMeta}>
                                    <span>Type: <strong style={{ color: 'white' }}>{test.type}</strong></span>
                                    <span>Latency: <strong style={{ color: 'white' }}>{test.latency_ms}ms</strong></span>
                                </div>
                            </div>

                            {test.turns && test.turns.length > 0 && (
                                <div style={styles.turnsSummary}>
                                    {test.turns.map((turn, tIdx) => (
                                        <div key={tIdx} style={styles.turnRow}>
                                            <div style={{ flex: '0 0 60px', color: '#94a3b8', fontWeight: 600 }}>T{turn.turn_index + 1}</div>
                                            <div style={{ flex: 1 }}>
                                                <div style={{ color: '#cbd5e1', marginBottom: '4px' }}>
                                                    <span style={{ color: turn.status === 'pass' ? '#4ade80' : '#f87171', marginRight: '8px' }}>•</span>
                                                    "{turn.expected_intent}"
                                                    <span style={styles.turnScore}>Semantic Score: {turn.similarity_score}</span>
                                                </div>
                                                <div style={{ color: '#64748b' }}>↳ {turn.transcript || 'No transcript generated.'}</div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default ReportDashboard;
