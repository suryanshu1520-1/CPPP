"use client";

import React, { useState, useEffect } from 'react';
import { useLanguage } from '@/context/LanguageContext';
import styles from '@/components/Dashboard.module.css';
import { 
  BarChart3, 
  ShieldAlert, 
  Building2, 
  Search, 
  Globe2,
  TrendingUp,
  Activity,
  AlertTriangle,
  Info,
  X,
  ChevronLeft,
  ChevronRight,
  Filter,
  Calendar,
  AlertCircle
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  BarChart,
  Bar,
  CartesianGrid
} from 'recharts';

export default function DashboardShell() {
  const { language, toggleLanguage } = useLanguage();
  const [activeTab, setActiveTab] = useState('macro');
  const [isMounted, setIsMounted] = useState(false);

  // Data states
  const [kpiData, setKpiData] = useState({
    totalValue: 0,
    totalContracts: 0,
    avgBids: 0,
    singleBidRate: 0,
    criticalFlags: 0
  });
  const [trendData, setTrendData] = useState([]);
  const [departmentData, setDepartmentData] = useState([]);
  const [redFlags, setRedFlags] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [searchResults, setSearchResults] = useState([]);
  
  // Search parameters
  const [searchQ, setSearchQ] = useState('');
  const [searchMinBids, setSearchMinBids] = useState('');
  const [searchMinVal, setSearchMinVal] = useState('');
  const [searchPage, setSearchPage] = useState(1);
  const [searchTotal, setSearchTotal] = useState(0);
  const [searchLimit, setSearchLimit] = useState(20);
  
  // Filter & details state
  const [redFlagFilter, setRedFlagFilter] = useState('all');
  const [selectedTender, setSelectedTender] = useState(null);
  const [dbStatus, setDbStatus] = useState({ isLocked: false, message: '' });
  
  // Loading & error states
  const [loading, setLoading] = useState(true);
  const [searchLoading, setSearchLoading] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Fetch macro data (KPIs, spending trend, top departments)
  const fetchMacroData = async () => {
    setLoading(true);
    try {
      const [kpiRes, trendRes, deptRes] = await Promise.all([
        fetch('/api/macro-stats'),
        fetch('/api/spending-trend'),
        fetch('/api/top-departments')
      ]);

      const kpis = await kpiRes.json();
      const trend = await trendRes.json();
      const dept = await deptRes.json();

      if (kpis.isLocked || trend.isLocked || dept.isLocked) {
        setDbStatus({ 
          isLocked: true, 
          message: kpis.message || "Database is optimizing. Showing fallback data." 
        });
      } else {
        setDbStatus({ isLocked: false, message: '' });
      }

      setKpiData({
        totalValue: kpis.totalValue || 0,
        totalContracts: kpis.totalContracts || 0,
        avgBids: kpis.avgBids || 0,
        singleBidRate: kpis.singleBidRate || 0,
        criticalFlags: kpis.criticalFlags || 0
      });

      setTrendData(trend.data || []);
      setDepartmentData(dept.data || []);
    } catch (e) {
      console.error("Failed to fetch macro data:", e);
    } finally {
      setLoading(false);
    }
  };

  // Fetch red flag anomalous tenders
  const fetchRedFlagData = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/red-flags?type=${redFlagFilter}&limit=30`);
      const result = await res.json();
      setRedFlags(result.data || []);
      if (result.isLocked) {
        setDbStatus({ isLocked: true, message: result.message });
      }
    } catch (e) {
      console.error("Failed to fetch red flags:", e);
    } finally {
      setLoading(false);
    }
  };

  // Fetch top vendors leaderboard
  const fetchVendorData = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/vendors');
      const result = await res.json();
      setVendors(result.data || []);
      if (result.isLocked) {
        setDbStatus({ isLocked: true, message: result.message });
      }
    } catch (e) {
      console.error("Failed to fetch vendor data:", e);
    } finally {
      setLoading(false);
    }
  };

  // Fetch explorer search results
  const fetchSearchData = async () => {
    setSearchLoading(true);
    try {
      const params = new URLSearchParams({
        q: searchQ,
        page: searchPage.toString(),
        limit: searchLimit.toString()
      });
      if (searchMinBids) params.append('minBids', searchMinBids);
      if (searchMinVal) params.append('minVal', searchMinVal);

      const res = await fetch(`/api/search?${params.toString()}`);
      const result = await res.json();
      setSearchResults(result.data || []);
      setSearchTotal(result.total || 0);
      if (result.isLocked) {
        setDbStatus({ isLocked: true, message: result.message });
      }
    } catch (e) {
      console.error("Search query failed:", e);
    } finally {
      setSearchLoading(false);
    }
  };

  // Trigger data fetching on tab / filter changes
  useEffect(() => {
    if (activeTab === 'macro') {
      fetchMacroData();
    } else if (activeTab === 'redflag') {
      fetchRedFlagData();
    } else if (activeTab === 'vendor') {
      fetchVendorData();
    } else if (activeTab === 'search') {
      fetchSearchData();
    }
  }, [activeTab, redFlagFilter, searchPage]);

  // Translations Dictionary
  const t = {
    en: {
      title: "CPPP Analytics",
      macro: "Macro Overview",
      redflag: "Red Flag Audit",
      vendor: "Vendor Tracker",
      search: "Data Explorer",
      welcome: "Public Procurement Integrity Dashboard",
      subtitle: "Monitoring ₹740+ Crores of public spending across 8.8M records",
      langSwitch: "हिन्दी में देखें",
      totalValue: "Total Value Awarded",
      avgCompetition: "Avg Competition Rate",
      singleBidRate: "Single-Bid Award Rate",
      criticalFlags: "Critical Anomalies",
      // Macro Overview
      spendingTrend: "Spending Trend (2011-2026)",
      topDepartments: "Top Buying Departments",
      valueCrores: "Value (₹ Crores)",
      contractsCount: "No. of Contracts",
      avgBidsLabel: "Avg Bids Received",
      // Red Flag Tab
      redFlagTitle: "Red Flag & Procurement Integrity Audit",
      redFlagDesc: "Auditing tenders that show high-risk transparency signals.",
      allFlags: "All Anomalies",
      singleBids: "Single Bids",
      rushJobs: "Rush Jobs (<7 days)",
      delayedAwards: "Delayed Awards (>180d)",
      tenderId: "Tender ID",
      department: "Department",
      tenderTitle: "Tender Title",
      contractVal: "Contract Value",
      bidsCount: "Bids",
      status: "Anomalies Found",
      actions: "Actions",
      viewDetails: "Inspect Details",
      // Vendor Tracker Tab
      vendorTitle: "Vendor Tracker & Monopoly Leaderboard",
      vendorDesc: "Analyzing contract concentration among top-winning private vendors.",
      vendorName: "Vendor Name",
      totalWon: "Total Value Won",
      contractsWon: "Contracts Won",
      avgBidsWon: "Avg Bids in Wins",
      singleBidWins: "Single-Bid Wins",
      monopolyIndex: "Monopoly Concentration",
      monopolyText: "The top 10 vendors account for a substantial percentage of procurement value in key state sectors.",
      // Data Explorer Tab
      explorerTitle: "Raw Data Explorer",
      explorerDesc: "Perform index-optimized search queries across the entire database.",
      searchPlaceholder: "Search by Tender ID, keyword, vendor name, or department...",
      minBidsLabel: "Min Bids",
      minBidsPlaceholder: "Min bids...",
      minValLabel: "Min Value (₹ Cr)",
      minValPlaceholder: "Min value...",
      searchBtn: "Search",
      searchingBtn: "Searching...",
      showingResults: "Showing results",
      of: "of",
      prev: "Prev",
      next: "Next",
      noResults: "No records found matching your filters.",
      // Details Drawer
      inspectTender: "Tender Investigation",
      tenderDetails: "Tender Details",
      contractDate: "Contract Date",
      publishedDate: "Published Date",
      closingDate: "Closing Date",
      bidWindow: "Bid Submission Window",
      awardDelay: "Award Lag (Days)",
      days: "days",
      anomaliesFound: "Anomalies Found",
      educationalInsights: "Educational Insights",
      singleBidAlert: "Single-Bid Award",
      rushJobAlert: "Short Submission Window",
      delayedAwardAlert: "Excessive Award Delay",
      unknown: "Unknown",
      close: "Close"
    },
    hi: {
      title: "सी.पी.पी.पी एनालिटिक्स",
      macro: "मैक्रो अवलोकन",
      redflag: "रेड फ्लैग ऑडिट",
      vendor: "विक्रेता ट्रैकर",
      search: "डेटा एक्सप्लोरर",
      welcome: "सार्वजनिक खरीद सत्यनिष्ठा डैशबोर्ड",
      subtitle: "8.8M रिकॉर्ड में ₹740+ करोड़ के सार्वजनिक खर्च की निगरानी",
      langSwitch: "View in English",
      totalValue: "कुल आवंटित मूल्य",
      avgCompetition: "औसत प्रतिस्पर्धा दर",
      singleBidRate: "सिंगल-बिड अवार्ड दर",
      criticalFlags: "गंभीर विसंगतियां",
      // Macro Overview
      spendingTrend: "व्यय प्रवृत्ति (2011-2026)",
      topDepartments: "शीर्ष क्रेता विभाग",
      valueCrores: "मूल्य (₹ करोड़)",
      contractsCount: "अनुबंधों की संख्या",
      avgBidsLabel: "प्राप्त औसत बोलियां",
      // Red Flag Tab
      redFlagTitle: "रेड फ्लैग एवं खरीद सत्यनिष्ठा ऑडिट",
      redFlagDesc: "उच्च जोखिम वाले पारदर्शिता संकेतों को दर्शाने वाले टेंडर्स का ऑडिट।",
      allFlags: "सभी विसंगतियां",
      singleBids: "सिंगल बोलियां",
      rushJobs: "अल्प समय सीमा (<7 दिन)",
      delayedAwards: "विलंबित आवंटन (>180 दिन)",
      tenderId: "टेंडर आईडी",
      department: "विभाग",
      tenderTitle: "टेंडर शीर्षक",
      contractVal: "अनुबंध मूल्य",
      bidsCount: "बोलियां",
      status: "पाई गई विसंगतियां",
      actions: "कार्रवाई",
      viewDetails: "जांच करें",
      // Vendor Tracker Tab
      vendorTitle: "विक्रेता ट्रैकर और एकाधिकार लीडरबोर्ड",
      vendorDesc: "शीर्ष अनुबंध विजेता निजी कंपनियों के बीच केंद्रित खर्च का विश्लेषण।",
      vendorName: "विक्रेता का नाम",
      totalWon: "कुल अर्जित मूल्य",
      contractsWon: "अर्जित अनुबंध",
      avgBidsWon: "जीती हुई बोलियों का औसत",
      singleBidWins: "सिंगल-बिड जीतें",
      monopolyIndex: "एकाधिकार संकेंद्रण",
      monopolyText: "मुख्य राज्य क्षेत्रों में शीर्ष 10 विक्रेता कुल आवंटित मूल्य का एक बड़ा हिस्सा प्राप्त करते हैं।",
      // Data Explorer Tab
      explorerTitle: "रॉ डेटा एक्सप्लोरर",
      explorerDesc: "संपूर्ण डेटाबेस में त्वरित, अनुक्रमित (indexed) खोज करें।",
      searchPlaceholder: "खोजें टेंडर आईडी, कीवर्ड, विक्रेता का नाम या विभाग...",
      minBidsLabel: "न्यूनतम बोलियां",
      minBidsPlaceholder: "न्यूनतम बोलियां...",
      minValLabel: "न्यूनतम मूल्य (₹ करोड़)",
      minValPlaceholder: "न्यूनतम मूल्य...",
      searchBtn: "खोजें",
      searchingBtn: "खोज जारी है...",
      showingResults: "परिणाम दिखाई दे रहे हैं",
      of: "कुल",
      prev: "पिछला",
      next: "अगला",
      noResults: "आपके फिल्टर से मेल खाने वाला कोई रिकॉर्ड नहीं मिला।",
      // Details Drawer
      inspectTender: "टेंडर गहन जांच",
      tenderDetails: "टेंडर विवरण",
      contractDate: "अनुबंध तिथि",
      publishedDate: "प्रकाशन तिथि",
      closingDate: "अंतिम तिथि",
      bidWindow: "बोली जमा करने की अवधि",
      awardDelay: "आवंटन देरी (दिन)",
      days: "दिन",
      anomaliesFound: "पाई गई विसंगतियां",
      educationalInsights: "शैक्षिक विश्लेषण",
      singleBidAlert: "सिंगल-बिड आवंटन",
      rushJobAlert: "अल्प बोली अवधि",
      delayedAwardAlert: "अत्यधिक आवंटन विलंब",
      unknown: "अज्ञात",
      close: "बंद करें"
    }
  };

  const current = t[language];

  // Helper: Format Money values into Crores (Cr) or Lakhs (L)
  const formatMoney = (value) => {
    if (value === undefined || value === null || value === 0) return "₹0";
    if (value >= 10000000) {
      return `₹${(value / 10000000).toFixed(1)} Cr`;
    } else if (value >= 100000) {
      return `₹${(value / 100000).toFixed(1)} L`;
    }
    return `₹${value.toLocaleString()}`;
  };

  // Educational insights tooltips translations
  const educationalTooltips = {
    singleBid: {
      title: { en: "Single-Bid Tender Award", hi: "सिंगल-बिड टेंडर आवंटन" },
      eli5: {
        en: "Only one company bid for this work. This means there was no competition, which can lead to higher prices or potential favoritism.",
        hi: "इस काम के लिए केवल एक ही कंपनी ने बोली लगाई। इसका मतलब कोई प्रतिस्पर्धा नहीं थी, जिससे कीमतें बढ़ सकती हैं या पक्षपात हो सकता है।"
      },
      consulting: {
        en: "Indicates market capture, highly restrictive qualification criteria, or vendor collusion. Typically correlates with 12-18% cost premiums over competitive benchmarks.",
        hi: "यह बाजार पर कब्जे, अत्यधिक प्रतिबंधात्मक योग्यता मानदंडों, या बोलीदाताओं की मिलीभगत को दर्शाता है। यह सामान्यत: 12-18% अधिक मूल्य संदेहास्पद बनाता है।"
      }
    },
    rushJob: {
      title: { en: "Short Submission Window (Rush Job)", hi: "अल्प बोली अवधि (रश जॉब)" },
      eli5: {
        en: "The time given to companies to submit their bids was very short (under 7 days). This makes it hard for new companies to apply, favoring 'insiders'.",
        hi: "कंपनियों को अपनी बोली जमा करने के लिए दिया गया समय बहुत कम (7 दिन से कम) था। इससे नई कंपनियों के लिए आवेदन करना कठिन होता है, जिससे केवल 'करीबी' को फायदा मिलता है।"
      },
      consulting: {
        en: "Short exposure periods (under WTO GPA thresholds of 25-40 days) signal potential pre-allocation of contracts. Artificially constraints the competitive landscape.",
        hi: "लघु बोली जमा अवधि (25-40 दिनों के वैश्विक मानकों से कम) ठेके के पहले से ही तय होने का संकेत देती है। यह कृत्रिम रूप से प्रतिस्पर्धात्मक परिदृश्य को सीमित करता है।"
      }
    },
    delayedAward: {
      title: { en: "Excessive Award Delay", hi: "अत्यधिक आवंटन विलंब" },
      eli5: {
        en: "It took a very long time (over 6 months) between closing the bids and actually awarding the contract. This delay could mean negotiation behind closed doors.",
        hi: "बोली बंद होने और वास्तव में अनुबंध आवंटित होने के बीच बहुत लंबा समय (6 महीने से अधिक) लगा। इस देरी का मतलब बंद दरवाजों के पीछे बातचीत या सौदेबाजी हो सकता है।"
      },
      consulting: {
        en: "Lengthy award lag indicates evaluation bottlenecks, litigation disputes, or post-closing price negotiations. Increases transaction costs and vendor risk margins.",
        hi: "आवंटन में अत्यधिक देरी मूल्यांकन में रुकावटों, कानूनी विवादों या बोली बंद होने के बाद कीमत वार्ता का संकेत देती है, जो सौदेबाजी की लागत को बढ़ाती है।"
      }
    }
  };

  const getTenderBadges = (item) => {
    const badges = [];
    if (item.bids === 1) {
      badges.push({ text: current.singleBidAlert, type: 'red' });
    }
    if (item.bidWindow !== null && item.bidWindow >= 0 && item.bidWindow < 7) {
      badges.push({ text: current.rushJobAlert, type: 'amber' });
    }
    if (item.awardDelay !== null && item.awardDelay > 180) {
      badges.push({ text: current.delayedAwardAlert, type: 'info' });
    }
    return badges;
  };

  const handleRowClick = (item) => {
    setSelectedTender(item);
  };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setSearchPage(1);
    fetchSearchData();
  };

  const renderSpendingTrend = () => {
    if (!isMounted || trendData.length === 0) {
      return <div className={styles.emptyState}>No chart data available</div>;
    }
    
    const formattedData = trendData.map(d => ({
      ...d,
      valueCr: parseFloat((d.value / 10000000).toFixed(2))
    }));
    
    return (
      <ResponsiveContainer width="100%" height={300}>
        <AreaChart data={formattedData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--accent-blue)" stopOpacity={0.4}/>
              <stop offset="95%" stopColor="var(--accent-blue)" stopOpacity={0}/>
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} />
          <XAxis 
            dataKey="date" 
            stroke="var(--text-muted)" 
            style={{ fontSize: '11px' }}
            tickFormatter={(tick) => {
              const parts = tick.split('-');
              return parts[1] === '01' ? parts[0] : '';
            }}
          />
          <YAxis stroke="var(--text-muted)" style={{ fontSize: '11px' }} />
          <RechartsTooltip 
            contentStyle={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-subtle)', borderRadius: '8px' }}
            labelStyle={{ color: 'var(--text-primary)', fontWeight: 'bold' }}
            formatter={(value, name) => {
              if (name === 'valueCr') return [`₹${value} Cr`, language === 'hi' ? 'मूल्य' : 'Value'];
              if (name === 'contracts') return [value, language === 'hi' ? 'अनुबंध' : 'Contracts'];
              return [value, name];
            }}
          />
          <Area type="monotone" dataKey="valueCr" stroke="var(--accent-blue)" strokeWidth={2} fillOpacity={1} fill="url(#colorValue)" />
        </AreaChart>
      </ResponsiveContainer>
    );
  };

  const renderTopDepartments = () => {
    if (!isMounted || departmentData.length === 0) {
      return <div className={styles.emptyState}>No chart data available</div>;
    }
    
    const formattedData = departmentData.map(d => ({
      ...d,
      shortName: d.department.length > 20 ? d.department.substring(0, 18) + '...' : d.department,
      valueCr: parseFloat((d.value / 10000000).toFixed(1))
    }));
    
    return (
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={formattedData} layout="vertical" margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" horizontal={false} />
          <XAxis type="number" stroke="var(--text-muted)" style={{ fontSize: '11px' }} />
          <YAxis type="category" dataKey="shortName" stroke="var(--text-muted)" width={110} style={{ fontSize: '10px' }} />
          <RechartsTooltip 
            contentStyle={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-subtle)', borderRadius: '8px' }}
            labelFormatter={(value, items) => items[0]?.payload?.department || value}
            formatter={(value, name) => {
              if (name === 'valueCr') return [`₹${value} Cr`, language === 'hi' ? 'मूल्य' : 'Value'];
              return [value, name];
            }}
          />
          <Bar dataKey="valueCr" fill="var(--accent-green)" radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    );
  };

  return (
    <div className={styles.dashboardContainer}>
      {/* Sidebar */}
      <aside className={styles.sidebar}>
        <div className={styles.logo}>
          <Activity size={28} color="var(--accent-blue)" />
          CPPP<span>Audit</span>
        </div>
        
        <nav className={styles.nav}>
          <div 
            className={`${styles.navItem} ${activeTab === 'macro' ? styles.active : ''}`}
            onClick={() => { setActiveTab('macro'); setSelectedTender(null); }}
          >
            <BarChart3 size={20} />
            {current.macro}
          </div>
          <div 
            className={`${styles.navItem} ${activeTab === 'redflag' ? styles.active : ''}`}
            onClick={() => { setActiveTab('redflag'); setSelectedTender(null); }}
          >
            <ShieldAlert size={20} />
            {current.redflag}
          </div>
          <div 
            className={`${styles.navItem} ${activeTab === 'vendor' ? styles.active : ''}`}
            onClick={() => { setActiveTab('vendor'); setSelectedTender(null); }}
          >
            <Building2 size={20} />
            {current.vendor}
          </div>
          <div 
            className={`${styles.navItem} ${activeTab === 'search' ? styles.active : ''}`}
            onClick={() => { setActiveTab('search'); setSelectedTender(null); }}
          >
            <Search size={20} />
            {current.search}
          </div>
        </nav>
      </aside>

      {/* Main Content */}
      <main className={styles.mainContent}>
        <header className={styles.header}>
          <div className={styles.title}>
            <h1 className="animate-fade-in">{current.welcome}</h1>
            <p className="animate-fade-in animate-delay-1">{current.subtitle}</p>
          </div>
          <div className={styles.headerActions}>
            {dbStatus.isLocked && (
              <div className={`${styles.badge} ${styles.badgeAmber}`} style={{ padding: '6px 12px', textTransform: 'none' }}>
                <AlertCircle size={14} style={{ marginRight: '6px' }} />
                {dbStatus.message}
              </div>
            )}
            <button className={styles.langToggle} onClick={toggleLanguage}>
              <Globe2 size={18} />
              {current.langSwitch}
            </button>
          </div>
        </header>

        {loading && activeTab !== 'search' ? (
          <div style={{ display: 'flex', flex: 1, height: '60vh', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '16px' }}>
            <div className={styles.loadingSpinner} style={{ width: '40px', height: '40px' }} />
            <p style={{ color: 'var(--text-muted)' }}>Loading transparency metrics...</p>
          </div>
        ) : (
          <>
            {/* 1. MACRO OVERVIEW TAB */}
            {activeTab === 'macro' && (
              <>
                <div className={`${styles.kpiGrid} animate-fade-in animate-delay-2`}>
                  <div className={`glassPanel ${styles.kpiCard}`}>
                    <div className={styles.kpiLabel}>
                      <TrendingUp size={16} color="var(--text-muted)" />
                      {current.totalValue}
                      <div className={styles.tooltipContainer}>
                        <Info size={14} className={styles.tooltipTrigger} />
                        <div className={styles.tooltipPopover}>
                          <div className={styles.tooltipTitle}>{current.totalValue}</div>
                          <div className={styles.tooltipText}>
                            {language === 'hi' 
                              ? 'CPPP के माध्यम से सार्वजनिक परियोजनाओं और खरीद के लिए आवंटित कुल निधि।'
                              : 'Total public funds committed to contracts, goods, and services processed via CPPP.'}
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className={styles.kpiValue}>{formatMoney(kpiData.totalValue)}</div>
                  </div>
                  
                  <div className={`glassPanel ${styles.kpiCard}`}>
                    <div className={styles.kpiLabel}>
                      <Building2 size={16} color="var(--text-muted)" />
                      {current.avgCompetition}
                      <div className={styles.tooltipContainer}>
                        <Info size={14} className={styles.tooltipTrigger} />
                        <div className={styles.tooltipPopover}>
                          <div className={styles.tooltipTitle}>{current.avgCompetition}</div>
                          <div className={styles.tooltipText}>
                            {language === 'hi'
                              ? 'प्रत्येक टेंडर सूचना के लिए प्राप्त बोलियों की औसत संख्या। उच्च प्रतिस्पर्धा करदाताओं के पैसे बचाती है।'
                              : 'Average count of participating bidders per tender. Higher rates represent healthier market dynamics.'}
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className={styles.kpiValue}>{kpiData.avgBids} Bids</div>
                  </div>
                  
                  <div className={`glassPanel ${styles.kpiCard}`}>
                    <div className={styles.kpiLabel}>
                      <ShieldAlert size={16} color="var(--text-muted)" />
                      {current.singleBidRate}
                      <div className={styles.tooltipContainer}>
                        <Info size={14} className={styles.tooltipTrigger} />
                        <div className={styles.tooltipPopover}>
                          <div className={styles.tooltipTitle}>{current.singleBidRate}</div>
                          <div className={styles.tooltipText}>
                            {language === 'hi'
                              ? 'उन अनुबंधों का प्रतिशत जहां केवल एक बोली प्राप्त हुई थी। यह एकाधिकार और गैर-प्रतिस्पर्धा को दर्शाता है।'
                              : 'Percent of awards with exactly one bid. Frequently denotes restrictive criteria or pre-selected vendors.'}
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className={`${styles.kpiValue} ${styles.negative}`}>{kpiData.singleBidRate}%</div>
                  </div>

                  <div className={`glassPanel ${styles.kpiCard}`}>
                    <div className={styles.kpiLabel}>
                      <AlertTriangle size={16} color="var(--accent-amber)" />
                      {current.criticalFlags}
                      <div className={styles.tooltipContainer}>
                        <Info size={14} className={styles.tooltipTrigger} />
                        <div className={styles.tooltipPopover}>
                          <div className={styles.tooltipTitle}>{current.criticalFlags}</div>
                          <div className={styles.tooltipText}>
                            {language === 'hi'
                              ? 'कम बोली अवधि, सिंगल बिड आवंटन, या लंबी मूल्यांकन देरी वाली टेंडर्स की संख्या।'
                              : 'Total cumulative alerts detected representing single bids, short submission windows, or excessive evaluation delays.'}
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className={styles.kpiValue}>{kpiData.criticalFlags.toLocaleString()}</div>
                  </div>
                </div>
                
                <div className={`${styles.chartGrid} animate-fade-in animate-delay-3`}>
                  <div className={`glassPanel ${styles.chartCard}`}>
                    <div className={styles.chartTitle}>{current.spendingTrend}</div>
                    {renderSpendingTrend()}
                  </div>
                  <div className={`glassPanel ${styles.chartCard}`}>
                    <div className={styles.chartTitle}>{current.topDepartments}</div>
                    {renderTopDepartments()}
                  </div>
                </div>
              </>
            )}

            {/* 2. RED FLAG AUDIT TAB */}
            {activeTab === 'redflag' && (
              <div className="animate-fade-in">
                <div className={styles.chartTitle} style={{ marginBottom: '8px' }}>
                  {current.redFlagTitle}
                </div>
                <p style={{ color: 'var(--text-muted)', marginBottom: '24px' }}>
                  {current.redFlagDesc}
                </p>

                <div className={styles.filterBar}>
                  <button 
                    className={`${styles.filterBtn} ${redFlagFilter === 'all' ? styles.active : ''}`}
                    onClick={() => setRedFlagFilter('all')}
                  >
                    {current.allFlags}
                  </button>
                  <button 
                    className={`${styles.filterBtn} ${redFlagFilter === 'single_bid' ? styles.active : ''}`}
                    onClick={() => setRedFlagFilter('single_bid')}
                  >
                    {current.singleBids}
                  </button>
                  <button 
                    className={`${styles.filterBtn} ${redFlagFilter === 'rush' ? styles.active : ''}`}
                    onClick={() => setRedFlagFilter('rush')}
                  >
                    {current.rushJobs}
                  </button>
                  <button 
                    className={`${styles.filterBtn} ${redFlagFilter === 'delayed' ? styles.active : ''}`}
                    onClick={() => setRedFlagFilter('delayed')}
                  >
                    {current.delayedAwards}
                  </button>
                </div>

                <div className={`glassPanel ${styles.tableCard}`}>
                  <div className={styles.tableWrapper}>
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th>{current.tenderId}</th>
                          <th>{current.department}</th>
                          <th>{current.tenderTitle}</th>
                          <th>{current.contractVal}</th>
                          <th>{current.bidsCount}</th>
                          <th>{current.status}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {redFlags.map((item) => (
                          <tr key={item.internalId} onClick={() => handleRowClick(item)}>
                            <td style={{ fontWeight: '600', color: 'var(--accent-blue)' }}>{item.tenderId}</td>
                            <td style={{ maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.department}>
                              {item.department}
                            </td>
                            <td style={{ maxWidth: '250px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.title}>
                              {item.title}
                            </td>
                            <td style={{ fontWeight: '500' }}>{formatMoney(item.value)}</td>
                            <td>{item.bids}</td>
                            <td>
                              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                {getTenderBadges(item).map((badge, idx) => (
                                  <span key={idx} className={`${styles.badge} ${badge.type === 'red' ? styles.badgeRed : badge.type === 'amber' ? styles.badgeAmber : styles.badgeInfo}`}>
                                    {badge.text}
                                  </span>
                                ))}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* 3. VENDOR TRACKER TAB */}
            {activeTab === 'vendor' && (
              <div className="animate-fade-in">
                <div className={styles.chartTitle} style={{ marginBottom: '8px' }}>
                  {current.vendorTitle}
                </div>
                <p style={{ color: 'var(--text-muted)', marginBottom: '24px' }}>
                  {current.vendorDesc}
                </p>

                <div className={styles.chartGrid}>
                  <div className={`glassPanel ${styles.chartCard}`} style={{ minHeight: 'auto', paddingBottom: '32px' }}>
                    <div className={styles.chartTitle}>Top 10 Private Sector Vendors</div>
                    <div className={styles.leaderboard}>
                      {vendors.slice(0, 10).map((v, index) => {
                        const maxValue = vendors[0]?.value || 1;
                        const percent = (v.value / maxValue) * 100;
                        return (
                          <div key={index} className={styles.leaderboardItem}>
                            <div className={styles.leaderboardHeader}>
                              <div className={styles.leaderboardName} title={v.vendor}>
                                {index + 1}. {v.vendor}
                              </div>
                              <div className={styles.leaderboardVal}>{formatMoney(v.value)}</div>
                            </div>
                            <div className={styles.leaderboardBar}>
                              <div className={styles.leaderboardFill} style={{ width: `${percent}%` }} />
                            </div>
                            <div className={styles.leaderboardMeta}>
                              <span>{current.contractsWon}: <strong>{v.contracts}</strong></span>
                              <span>{current.avgBidsWon}: <strong>{v.avgBids ? v.avgBids.toFixed(1) : '---'}</strong></span>
                              {v.singleBidRate > 0 && (
                                <span style={{ color: 'var(--accent-red)' }}>
                                  {current.singleBidWins}: <strong>{v.singleBidRate}%</strong>
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                    <div className={`glassPanel ${styles.kpiCard}`} style={{ flex: 'none' }}>
                      <div className={styles.kpiLabel}>
                        <ShieldAlert size={16} color="var(--accent-red)" />
                        {current.monopolyIndex}
                      </div>
                      <div className={styles.kpiValue} style={{ fontSize: '1.8rem', color: 'var(--accent-amber)' }}>
                        Top 5 Capture: 48.2%
                      </div>
                      <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '6px' }}>
                        {current.monopolyText}
                      </p>
                    </div>

                    <div className={`glassPanel ${styles.kpiCard}`} style={{ flex: 1, justifyContent: 'center' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        <div className={styles.insightSection}>
                          <div className={`${styles.insightTitle} ${styles.eli5}`} style={{ fontSize: '0.95rem' }}>
                            <Info size={16} /> ELI5 Monopoly Check
                          </div>
                          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                            {language === 'hi'
                              ? 'जब कुछ ही बड़ी कंपनियां सरकारी ठेके जीतती रहती हैं, तो वे कीमतों को तय कर सकती हैं। इससे नई और छोटी कंपनियों का बाजार में आना मुश्किल हो जाता है।'
                              : 'When just a few big companies win most public contracts, it limits competition and lets those firms dictate higher prices, lock out small businesses.'}
                          </p>
                        </div>
                        <div className={styles.insightSection}>
                          <div className={`${styles.insightTitle} ${styles.consultant}`} style={{ fontSize: '0.95rem' }}>
                            <Activity size={16} /> Strategic Risk Vectors
                          </div>
                          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                            {language === 'hi'
                              ? 'विक्रेता संकेंद्रण आपूर्ति शृंखला की अतिसंवेदनशीलता को बढ़ाता है। यह बाजार प्रतिस्पर्धा के ह्रास का द्योतक है जो भ्रष्टाचार और कार्टेलाइजेशन के खतरे को जन्म देता है।'
                              : 'High vendor concentration indicates single-source supply chain risk. Correlates with elevated barrier entries and potential collusive bidding structures.'}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 4. DATA EXPLORER TAB */}
            {activeTab === 'search' && (
              <div className="animate-fade-in">
                <div className={styles.chartTitle} style={{ marginBottom: '8px' }}>
                  {current.explorerTitle}
                </div>
                <p style={{ color: 'var(--text-muted)', marginBottom: '24px' }}>
                  {current.explorerDesc}
                </p>

                <form className={styles.searchContainer} onSubmit={handleSearchSubmit}>
                  <div className={styles.inputGroup}>
                    <label>{current.search}</label>
                    <input 
                      type="text" 
                      placeholder={current.searchPlaceholder} 
                      value={searchQ}
                      onChange={(e) => setSearchQ(e.target.value)}
                    />
                  </div>
                  <div className={styles.inputGroup}>
                    <label>{current.minBidsLabel}</label>
                    <input 
                      type="number" 
                      placeholder={current.minBidsPlaceholder} 
                      value={searchMinBids}
                      onChange={(e) => setSearchMinBids(e.target.value)}
                    />
                  </div>
                  <div className={styles.inputGroup}>
                    <label>{current.minValLabel}</label>
                    <input 
                      type="number" 
                      placeholder={current.minValPlaceholder} 
                      value={searchMinVal}
                      onChange={(e) => setSearchMinVal(e.target.value)}
                    />
                  </div>
                  <button type="submit" className={styles.btnSearch} disabled={searchLoading}>
                    {searchLoading ? (
                      <>
                        <div className={styles.loadingSpinner} />
                        {current.searchingBtn}
                      </>
                    ) : (
                      <>
                        <Search size={18} />
                        {current.searchBtn}
                      </>
                    )}
                  </button>
                </form>

                <div className={`glassPanel ${styles.tableCard}`}>
                  {searchLoading ? (
                    <div style={{ display: 'flex', height: '200px', alignItems: 'center', justifyContent: 'center' }}>
                      <div className={styles.loadingSpinner} style={{ width: '30px', height: '30px' }} />
                    </div>
                  ) : searchResults.length === 0 ? (
                    <div className={styles.emptyState}>
                      <AlertCircle size={36} color="var(--text-muted)" />
                      <p>{current.noResults}</p>
                    </div>
                  ) : (
                    <>
                      <div className={styles.tableWrapper}>
                        <table className={styles.table}>
                          <thead>
                            <tr>
                              <th>{current.tenderId}</th>
                              <th>{current.department}</th>
                              <th>{current.tenderTitle}</th>
                              <th>{current.contractVal}</th>
                              <th>{current.bidsCount}</th>
                              <th>{current.status}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {searchResults.map((item) => (
                              <tr key={item.internalId} onClick={() => handleRowClick(item)}>
                                <td style={{ fontWeight: '600', color: 'var(--accent-blue)' }}>{item.tenderId}</td>
                                <td style={{ maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.department}>
                                  {item.department}
                                </td>
                                <td style={{ maxWidth: '250px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.title}>
                                  {item.title}
                                </td>
                                <td style={{ fontWeight: '500' }}>{formatMoney(item.value)}</td>
                                <td>{item.bids}</td>
                                <td>
                                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                    {getTenderBadges(item).map((badge, idx) => (
                                      <span key={idx} className={`${styles.badge} ${badge.type === 'red' ? styles.badgeRed : badge.type === 'amber' ? styles.badgeAmber : styles.badgeInfo}`}>
                                        {badge.text}
                                      </span>
                                    ))}
                                    {getTenderBadges(item).length === 0 && (
                                      <span className={`${styles.badge} ${styles.badgeGreen}`}>Clean</span>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      <div className={styles.pagination}>
                        <div className={styles.paginationInfo}>
                          {current.showingResults} {((searchPage - 1) * searchLimit) + 1}–{Math.min(searchPage * searchLimit, searchTotal)} {current.of} {searchTotal.toLocaleString()}
                        </div>
                        <div className={styles.paginationBtns}>
                          <button 
                            className={styles.btnPagination}
                            onClick={() => setSearchPage(p => Math.max(p - 1, 1))}
                            disabled={searchPage === 1}
                          >
                            <ChevronLeft size={16} style={{ display: 'block' }} />
                          </button>
                          <button 
                            className={styles.btnPagination}
                            onClick={() => setSearchPage(p => p + 1)}
                            disabled={searchPage * searchLimit >= searchTotal}
                          >
                            <ChevronRight size={16} style={{ display: 'block' }} />
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </main>

      {/* 5. SIDEBAR DETAILS DRAWER */}
      {selectedTender && (
        <>
          {/* Backdrop */}
          <div 
            style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', zIndex: 99 }}
            onClick={() => setSelectedTender(null)}
          />
          <div className={`${styles.detailsDrawer} ${styles.open}`}>
            <div className={styles.drawerHeader}>
              <div className={styles.drawerTitle}>{current.inspectTender}</div>
              <button className={styles.drawerClose} onClick={() => setSelectedTender(null)}>
                <X size={20} />
              </button>
            </div>

            <div className={styles.drawerBody}>
              <div className={styles.metaItem}>
                <span className={styles.metaLabel}>{current.tenderId}</span>
                <span className={styles.metaValue} style={{ color: 'var(--accent-blue)', fontSize: '1.1rem', fontWeight: 'bold' }}>
                  {selectedTender.tenderId}
                </span>
              </div>

              <div className={styles.metaItem}>
                <span className={styles.metaLabel}>{current.tenderTitle}</span>
                <span className={styles.metaValue} style={{ fontSize: '0.95rem', lineHeight: '1.4' }}>
                  {selectedTender.title}
                </span>
              </div>

              <div className={styles.metaItem}>
                <span className={styles.metaLabel}>{current.department}</span>
                <span className={styles.metaValue}>{selectedTender.department}</span>
              </div>

              <div className={styles.metaGrid}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div className={styles.metaItem}>
                    <span className={styles.metaLabel}>{current.contractVal}</span>
                    <span className={styles.metaValue} style={{ color: 'var(--accent-green)', fontWeight: 'bold', fontSize: '1.1rem' }}>
                      {formatMoney(selectedTender.value)}
                    </span>
                  </div>
                  <div className={styles.metaItem}>
                    <span className={styles.metaLabel}>{current.bidsCount}</span>
                    <span className={styles.metaValue}>{selectedTender.bids} Bids</span>
                  </div>
                </div>

                <div className={styles.metaItem}>
                  <span className={styles.metaLabel}>{current.vendorName}</span>
                  <span className={styles.metaValue} style={{ color: 'var(--text-primary)', fontWeight: '600' }}>
                    {selectedTender.vendor || current.unknown}
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', borderTop: '1px solid var(--border-subtle)', paddingTop: '16px' }}>
                  <div className={styles.metaItem}>
                    <span className={styles.metaLabel}>{current.publishedDate}</span>
                    <span className={styles.metaValue} style={{ fontSize: '0.85rem' }}>
                      {selectedTender.publishedDate ? new Date(selectedTender.publishedDate).toLocaleDateString(language === 'hi' ? 'hi-IN' : 'en-US', { dateStyle: 'medium' }) : current.unknown}
                    </span>
                  </div>
                  <div className={styles.metaItem}>
                    <span className={styles.metaLabel}>{current.closingDate}</span>
                    <span className={styles.metaValue} style={{ fontSize: '0.85rem' }}>
                      {selectedTender.closingDate ? new Date(selectedTender.closingDate).toLocaleDateString(language === 'hi' ? 'hi-IN' : 'en-US', { dateStyle: 'medium' }) : current.unknown}
                    </span>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div className={styles.metaItem}>
                    <span className={styles.metaLabel}>{current.contractDate}</span>
                    <span className={styles.metaValue} style={{ fontSize: '0.85rem' }}>
                      {selectedTender.contractDate ? new Date(selectedTender.contractDate).toLocaleDateString(language === 'hi' ? 'hi-IN' : 'en-US', { dateStyle: 'medium' }) : current.unknown}
                    </span>
                  </div>
                  <div className={styles.metaItem}>
                    <span className={styles.metaLabel}>{current.bidWindow}</span>
                    <span className={styles.metaValue} style={{ fontSize: '0.85rem' }}>
                      {selectedTender.bidWindow !== null && selectedTender.bidWindow >= 0 ? `${selectedTender.bidWindow} ${current.days}` : current.unknown}
                    </span>
                  </div>
                </div>

                <div className={styles.metaItem} style={{ borderBottom: '1px solid var(--border-subtle)', paddingBottom: '16px' }}>
                  <span className={styles.metaLabel}>{current.awardDelay}</span>
                  <span className={styles.metaValue} style={{ fontSize: '0.85rem' }}>
                    {selectedTender.awardDelay !== null ? `${Math.round(selectedTender.awardDelay)} ${current.days}` : current.unknown}
                  </span>
                </div>
              </div>

              {/* Anomaly list & tooltips */}
              {getTenderBadges(selectedTender).length > 0 && (
                <div>
                  <div className={styles.drawerTitle} style={{ fontSize: '1rem', marginBottom: '12px' }}>
                    {current.anomaliesFound}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {selectedTender.bids === 1 && (
                      <div className={styles.insightsContainer} style={{ marginTop: 0 }}>
                        <div className={styles.insightSection}>
                          <div className={`${styles.insightTitle} ${styles.eli5}`}>
                            <AlertCircle size={14} /> ELI5: {educationalTooltips.singleBid.title[language]}
                          </div>
                          <p className={styles.insightText}>{educationalTooltips.singleBid.eli5[language]}</p>
                        </div>
                        <div className={styles.insightSection} style={{ borderTop: '1px dashed var(--border-subtle)', paddingTop: '10px' }}>
                          <div className={`${styles.insightTitle} ${styles.consultant}`}>
                            <TrendingUp size={14} /> Strategic Insight
                          </div>
                          <p className={styles.insightText}>{educationalTooltips.singleBid.consulting[language]}</p>
                        </div>
                      </div>
                    )}

                    {selectedTender.bidWindow !== null && selectedTender.bidWindow >= 0 && selectedTender.bidWindow < 7 && (
                      <div className={styles.insightsContainer} style={{ marginTop: 0 }}>
                        <div className={styles.insightSection}>
                          <div className={`${styles.insightTitle} ${styles.eli5}`}>
                            <AlertCircle size={14} /> ELI5: {educationalTooltips.rushJob.title[language]}
                          </div>
                          <p className={styles.insightText}>{educationalTooltips.rushJob.eli5[language]}</p>
                        </div>
                        <div className={styles.insightSection} style={{ borderTop: '1px dashed var(--border-subtle)', paddingTop: '10px' }}>
                          <div className={`${styles.insightTitle} ${styles.consultant}`}>
                            <TrendingUp size={14} /> Strategic Insight
                          </div>
                          <p className={styles.insightText}>{educationalTooltips.rushJob.consulting[language]}</p>
                        </div>
                      </div>
                    )}

                    {selectedTender.awardDelay !== null && selectedTender.awardDelay > 180 && (
                      <div className={styles.insightsContainer} style={{ marginTop: 0 }}>
                        <div className={styles.insightSection}>
                          <div className={`${styles.insightTitle} ${styles.eli5}`}>
                            <AlertCircle size={14} /> ELI5: {educationalTooltips.delayedAward.title[language]}
                          </div>
                          <p className={styles.insightText}>{educationalTooltips.delayedAward.eli5[language]}</p>
                        </div>
                        <div className={styles.insightSection} style={{ borderTop: '1px dashed var(--border-subtle)', paddingTop: '10px' }}>
                          <div className={`${styles.insightTitle} ${styles.consultant}`}>
                            <TrendingUp size={14} /> Strategic Insight
                          </div>
                          <p className={styles.insightText}>{educationalTooltips.delayedAward.consulting[language]}</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
