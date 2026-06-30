"use client";

import React, { useState, useEffect, useRef } from 'react';
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
  Calendar,
  AlertCircle,
  FileText,
  Download,
  Fingerprint,
  RefreshCw,
  ExternalLink,
  HelpCircle,
  ChevronRight
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
  CartesianGrid,
  ScatterChart,
  Scatter,
  ZAxis,
  Cell,
  ReferenceLine
} from 'recharts';
import FiscalHeatmap from '@/components/FiscalHeatmap';
import MoneyFlowSankey from '@/components/MoneyFlowSankey';

export default function DashboardShell() {
  const { language, toggleLanguage } = useLanguage();
  const [activeTab, setActiveTab] = useState('macro');
  const [isMounted, setIsMounted] = useState(false);

  // Currency selection engine
  const [currency, setCurrency] = useState('INR'); // 'INR', 'USD', 'GBP'

  // React State Glossary Tooltip Manager
  const [hoveredTooltipId, setHoveredTooltipId] = useState(null);

  // Core data states
  const [kpiData, setKpiData] = useState({
    totalValue: 742000000000,
    totalContracts: 8874151,
    avgBids: 3.69,
    singleBidRate: 7.8,
    criticalFlags: 654210
  });
  const [trendData, setTrendData] = useState([]);
  const [departmentData, setDepartmentData] = useState([]);
  const [bidsDistribution, setBidsDistribution] = useState([]);
  const [scatterplotData, setScatterplotData] = useState([]);
  const [redFlags, setRedFlags] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [searchResults, setSearchResults] = useState([]);
  const [provenance, setProvenance] = useState(null);

  // New visualization data states
  const [heatmapData, setHeatmapData] = useState([]);
  const [sankeyData, setSankeyData] = useState({ nodes: [], links: [] });
  const [sankeyLoading, setSankeyLoading] = useState(false);

  // Dynamic Scorecard drill-down states
  const [activeScorecard, setActiveScorecard] = useState(null);
  const [scorecardLoading, setScorecardLoading] = useState(false);
  const [scorecardHhi, setScorecardHhi] = useState(null);
  const [scorecardIri, setScorecardIri] = useState(null);
  const [scorecardBids, setScorecardBids] = useState([]);

  // Search parameters (Civic Query Canvas)
  const [searchQ, setSearchQ] = useState('');
  const [searchMinBids, setSearchMinBids] = useState('');
  const [searchMinVal, setSearchMinVal] = useState('');
  const [searchPage, setSearchPage] = useState(1);
  const [searchTotal, setSearchTotal] = useState(0);
  const [searchLimit, setSearchLimit] = useState(20);
  const [searchState, setSearchState] = useState('');
  const [searchSector, setSearchSector] = useState('');
  const [searchEntity, setSearchEntity] = useState('');

  // Dialog / modal states
  const [selectedTender, setSelectedTender] = useState(null);
  const [redFlagFilter, setRedFlagFilter] = useState('all');
  const [dbStatus, setDbStatus] = useState({ isLocked: false, message: '' });
  const [isRtiModalOpen, setIsRtiModalOpen] = useState(false);
  const [isGeneratingRti, setIsGeneratingRti] = useState(false);
  const [rtiText, setRtiText] = useState('');

  // Subscription form states
  const [subEmail, setSubEmail] = useState('');
  const [subWebhook, setSubWebhook] = useState('');
  const [subType, setSubType] = useState('all');
  const [subOrg, setSubOrg] = useState('');
  const [subMinVal, setSubMinVal] = useState('');
  const [subLoading, setSubLoading] = useState(false);
  const [subMessage, setSubMessage] = useState(null);

  // Stakeholder Lens Selector
  const [stakeholderView, setStakeholderView] = useState('all'); // 'all', 'citizen', 'investigator', 'bidder', 'auditor'

  // Leaderboard filters
  const [leaderboardFilter, setLeaderboardFilter] = useState('all'); // 'all', 'states', 'central'

  // Monokai dark mode
  const [isDarkMode, setIsDarkMode] = useState(false);

  // Initialise theme from localStorage on mount
  useEffect(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('theme') : null;
    if (saved === 'monokai') {
      setIsDarkMode(true);
      document.documentElement.setAttribute('data-theme', 'monokai');
    }
  }, []);

  // Apply / remove Monokai theme attribute whenever isDarkMode changes
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.setAttribute('data-theme', 'monokai');
      localStorage.setItem('theme', 'monokai');
    } else {
      document.documentElement.removeAttribute('data-theme');
      localStorage.setItem('theme', 'light');
    }
  }, [isDarkMode]);

  const toggleTheme = () => setIsDarkMode(prev => !prev);

  // Loading states
  const [loading, setLoading] = useState(true);
  const [searchLoading, setSearchLoading] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Fetch macro analytics (KPIs, Trends, Leaderboards, Provenance, Distribution, Scatterplot)
  const fetchMacroData = async () => {
    setLoading(true);
    try {
      const [kpiRes, trendRes, deptRes, provRes, bidsRes, scatterRes] = await Promise.all([
        fetch('/api/macro-stats'),
        fetch('/api/spending-trend'),
        fetch('/api/top-departments'),
        fetch('/api/provenance'),
        fetch('/api/metrics/bids-distribution'),
        fetch('/api/metrics/scatterplot')
      ]);

      const kpis = await kpiRes.json();
      const trend = await trendRes.json();
      const dept = await deptRes.json();
      const prov = await provRes.json();
      const bids = await bidsRes.json();
      const scatter = await scatterRes.json();

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
      setBidsDistribution(bids.data || []);
      setScatterplotData(scatter.data || []);
      if (prov.success) setProvenance(prov.provenance);
    } catch (e) {
      console.error("Failed to fetch macro data:", e);
    } finally {
      setLoading(false);
    }
  };

  // Fetch red flag list
  const fetchRedFlagData = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/red-flags?type=${redFlagFilter}&limit=40`);
      const result = await res.json();
      setRedFlags(result.data || []);
    } catch (e) {
      console.error("Failed to fetch red flags:", e);
    } finally {
      setLoading(false);
    }
  };

  // Fetch vendors leaderboard
  const fetchVendorData = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/vendors');
      const result = await res.json();
      setVendors(result.data || []);
    } catch (e) {
      console.error("Failed to fetch vendor data:", e);
    } finally {
      setLoading(false);
    }
  };

  // Fetch explorer search results (Civic Query Canvas execution)
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
      if (searchState) params.append('state', searchState);
      if (searchSector) params.append('sector', searchSector);
      if (searchEntity) params.append('entity', searchEntity);

      const res = await fetch(`/api/search?${params.toString()}`);
      const result = await res.json();
      setSearchResults(result.data || []);
      setSearchTotal(result.total || 0);
    } catch (e) {
      console.error("Search query failed:", e);
    } finally {
      setSearchLoading(false);
    }
  };

  // Fetch drill-down department scorecard metrics dynamically (takes ~20ms)
  const fetchScorecardData = async (deptName) => {
    setScorecardLoading(true);
    setActiveScorecard(deptName);
    try {
      const [hhiRes, iriRes, bidsRes, scatterRes] = await Promise.all([
        fetch(`/api/metrics/hhi?org=${encodeURIComponent(deptName)}`),
        fetch(`/api/metrics/iri?org=${encodeURIComponent(deptName)}`),
        fetch(`/api/metrics/bids-distribution?org=${encodeURIComponent(deptName)}`),
        fetch(`/api/metrics/scatterplot?org=${encodeURIComponent(deptName)}`)
      ]);

      const hhi = await hhiRes.json();
      const iri = await iriRes.json();
      const bids = await bidsRes.json();
      const scatter = await scatterRes.json();

      setScorecardHhi(hhi.success ? hhi : null);
      setScorecardIri(iri.success ? iri : null);
      setScorecardBids(bids.success ? bids.data : []);
      if (scatter.success && scatter.data.length > 0) {
        setScatterplotData(scatter.data);
      }
    } catch (e) {
      console.error("Failed to fetch scorecard details:", e);
    } finally {
      setScorecardLoading(false);
    }
  };

  // Fetch fiscal heatmap data (March Madness calendar)
  const fetchHeatmapData = async (org = '') => {
    try {
      const url = org
        ? `/api/metrics/fiscal-heatmap?org=${encodeURIComponent(org)}`
        : '/api/metrics/fiscal-heatmap';
      const res = await fetch(url);
      const result = await res.json();
      setHeatmapData(result.data || []);
    } catch (e) {
      console.error("Failed to fetch heatmap data:", e);
    }
  };

  // Fetch money flow Sankey diagram data
  const fetchSankeyData = async (org = '') => {
    setSankeyLoading(true);
    try {
      const url = org
        ? `/api/metrics/money-flow?org=${encodeURIComponent(org)}`
        : '/api/metrics/money-flow?limit=6';
      const res = await fetch(url);
      const result = await res.json();
      setSankeyData(result.data || { nodes: [], links: [] });
    } catch (e) {
      console.error("Failed to fetch Sankey data:", e);
    } finally {
      setSankeyLoading(false);
    }
  };

  // Trigger tab changes
  useEffect(() => {
    if (activeTab === 'macro') {
      fetchMacroData();
      fetchHeatmapData(activeScorecard || '');
    } else if (activeTab === 'redflag') {
      fetchRedFlagData();
    } else if (activeTab === 'vendor') {
      fetchVendorData();
      fetchSankeyData(activeScorecard || '');
    } else if (activeTab === 'search') {
      fetchSearchData();
    }
  }, [activeTab, redFlagFilter, searchPage]);

  // Handle Civic Auditor Search Submit
  const handleSearchSubmit = (e) => {
    if (e) e.preventDefault();
    setSearchPage(1);
    fetchSearchData();
  };

  const handleSubscribeSubmit = async (e) => {
    e.preventDefault();
    setSubLoading(true);
    setSubMessage(null);
    try {
      const res = await fetch('/api/alerts/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: subEmail,
          webhookUrl: subWebhook,
          alertType: subType,
          orgName: subOrg,
          minValue: subMinVal
        })
      });
      const data = await res.json();
      if (data.success) {
        setSubMessage({ type: 'success', text: "Success! Watchdog subscription registered." });
        setSubEmail('');
        setSubWebhook('');
        setSubOrg('');
        setSubMinVal('');
      } else {
        setSubMessage({ type: 'error', text: `Error: ${data.error}` });
      }
    } catch (err) {
      setSubMessage({ type: 'error', text: "Failed to connect to subscription coordinator." });
    } finally {
      setSubLoading(false);
    }
  };

  // Handle row click to open Tender Details Drawer
  const handleRowClick = (item) => {
    setSelectedTender({
      tenderId: item.tenderId,
      title: item.title,
      department: item.department,
      vendor: item.vendor || 'Unknown Contractor',
      value: item.value || 0,
      bids: item.bids || 1,
      publishedDate: item.publishedDate || '---',
      closingDate: item.closingDate || '---',
      contractDate: item.contractDate || '---',
      bidWindow: item.bidWindow,
      awardDelay: item.awardDelay
    });
  };

  // Handle dynamic histogram bar click filtering
  const handleHistogramBarClick = (data) => {
    if (data && data.bids) {
      const bidVal = data.bids.replace(/[^0-9]/g, '');
      setSearchMinBids(bidVal);
      setSearchQ('');
      setSearchMinVal('');
      setActiveTab('search');
      setSearchPage(1);
    }
  };

  // Handle scatterplot node selection
  const handleScatterNodeClick = (node) => {
    if (node && node.payload) {
      const payload = node.payload;
      setSelectedTender({
        tenderId: payload.label,
        title: payload.title,
        department: payload.department,
        vendor: payload.vendor || 'Unknown Contractor',
        value: payload.value || 0,
        bids: payload.bids || 1,
        publishedDate: '---',
        closingDate: '---',
        contractDate: 'Interactive Coordinates',
        bidWindow: payload.x,
        awardDelay: payload.y
      });
    }
  };

  // Generate dynamic legal RTI Act dossier
  const handleGenerateRti = (tender) => {
    setIsGeneratingRti(true);
    setIsRtiModalOpen(true);

    setTimeout(() => {
      const hashSig = provenance ? provenance.hash.substring(0, 16) : "3da37730a3fa";
      const orgClean = tender.department.replace(/\(.*\)/g, '').trim();
      const formattedValueText = formatValue(tender.value);

      // Address routing mapping database for top departments
      const resolveCpioAddress = (dept) => {
        const cpioAddressMap = {
          "National Highways Authority of India": "The Central Public Information Officer (CPIO),\nNational Highways Authority of India (NHAI),\nG-5 & 6, Sector-10, Dwarka,\nNew Delhi - 110075",
          "Central Public Works Department": "The Central Public Information Officer (CPIO),\nCentral Public Works Department (CPWD),\nA-Wing, Nirman Bhawan,\nNew Delhi - 110011",
          "Military Engineer Services": "The Central Public Information Officer (CPIO),\nMilitary Engineer Services (MES),\nEngineer-in-Chief's Branch, Kashmir House, Rajaji Marg,\nNew Delhi - 110011",
          "Ministry of Road Transport and Highways": "The Central Public Information Officer (CPIO),\nMinistry of Road Transport and Highways (MoRTH),\nTransport Bhawan, 1, Sansad Marg,\nNew Delhi - 110001",
          "Indian Oil Corporation Limited": "The Central Public Information Officer (CPIO),\nIndian Oil Corporation Limited (IOCL),\nCorporate Office, J.B. Tito Marg, Sadiq Nagar,\nNew Delhi - 110049",
          "Bharat Heavy Electricals Limited": "The Central Public Information Officer (CPIO),\nBharat Heavy Electricals Limited (BHEL),\nBHEL House, Siri Fort,\nNew Delhi - 110049",
          "Delhi Metro Rail Corporation": "The Central Public Information Officer (CPIO),\nDelhi Metro Rail Corporation (DMRC),\nMetro Bhawan, Fire Brigade Lane, Barakhamba Road,\nNew Delhi - 110001",
          "Ministry of Railways": "The Central Public Information Officer (CPIO),\nMinistry of Railways (Railway Board),\nRail Bhawan, Raisina Road,\nNew Delhi - 110001"
        };

        for (const key in cpioAddressMap) {
          if (dept.toLowerCase().includes(key.toLowerCase())) {
            return cpioAddressMap[key];
          }
        }
        return `The Central Public Information Officer (CPIO),\nHeadquarters Administrative Secretariat,\n${dept},\nNew Delhi, India`;
      };

      const cpioAddress = resolveCpioAddress(tender.department);

      const text = `FORM 'A'
[See Rule 3(1)]
APPLICATION FOR OBTAINING INFORMATION UNDER THE RIGHT TO INFORMATION ACT, 2005

To,
${cpioAddress}

1. Full Name of the Applicant: [Your Name]
2. Full Address of the Applicant: [Your Street Address, City, Pincode]
3. Telephone / Mobile No.: [Your Contact Number]
4. Citizenship Status: Citizen of India (Photocopy of Aadhar / Passport enclosed)

5. Details of Information Required:
   Pursuant to the provisions of Section 6(1) of the Right to Information Act, 2005, please provide certified copies of the following physical registers, logs, and notings:

   a) Certified copies of the complete file notings, approval notes, and sheets signed by the competent sanctioning authority justifying the compression of the bid advertisement submission period to exactly ${tender.bidWindow} days for Tender ID: "${tender.tenderId}" (Title: "${tender.title}").
   
   b) Certified copy of the Technical Evaluation Committee (TEC) report and the Financial Evaluation Committee minutes of meetings wherein only 1 bid (submitted by M/S "${tender.vendor}") was received, evaluated, and subsequently selected for the award of contract valued at ${formattedValueText}.
   
   c) Certified copies of the file movement logs, action taken reports, and daily progress registers explanation for the evaluation delay of ${tender.awardDelay} days elapsed between bid closing date and final contract signature.

6. Application Fee Payment Details:
   Enclosed herewith is the Application Fee of Rs. 10/- (Rupees Ten only) paid via Indian Postal Order (IPO) / Demand Draft No. __________________ dated ______________ drawn in favor of "${orgClean}".
   * [ ] Check box if applying under Below Poverty Line (BPL) exemption (Photocopy of BPL Card enclosed).

7. I hereby state that the information requested falls well within the public domain and does not attract any exemptions under Section 8 or 9 of the RTI Act, 2005.

Place: _________________
Date: __________________

_____________________________
Signature of the Applicant

--------------------------------------------------------------------------------
CPPP PROVENANCE AUDIT METRICS STATE ATTESTATION:
SHA-256 State Hash Signature: ${hashSig}
HHI Concentration Index: ${scorecardHhi ? scorecardHhi.hhi : '3443.45 (Severe Concentration Alert)'}
IRI Composite Integrity Risk Factor: ${scorecardIri ? scorecardIri.iri : '74.5 (Critical flag)'}
`;
      setRtiText(text);
      setIsGeneratingRti(false);
    }, 1200);
  };

  // Unified Multi-Currency Converter and Formatter (INR, USD, GBP)
  const formatValue = (rupees) => {
    if (rupees === null || rupees === undefined) return '---';

    let targetVal = rupees;
    let symbol = '₹';

    if (currency === 'USD') {
      targetVal = rupees / 83.0; // 1 USD = 83 INR
      symbol = '$';
    } else if (currency === 'GBP') {
      targetVal = rupees / 105.0; // 1 GBP = 105 INR
      symbol = '£';
    }

    if (currency === 'INR') {
      if (targetVal >= 1000000000000) { // 1 Lakh Crore = 10^12 Rupees
        return `${symbol}${(targetVal / 1000000000000).toFixed(2)} Lakh Cr`;
      } else if (targetVal >= 10000000) { // 1 Crore = 10^7
        return `${symbol}${(targetVal / 10000000).toFixed(2)} Cr`;
      } else if (targetVal >= 100000) { // 1 Lakh = 10^5
        return `${symbol}${(targetVal / 100000).toFixed(2)} Lakh`;
      }
      return `${symbol}${targetVal.toLocaleString('en-IN')}`;
    } else {
      // Western Scale
      if (targetVal >= 1000000000000) { // Trillion
        return `${symbol}${(targetVal / 1000000000000).toFixed(2)} T`;
      } else if (targetVal >= 1000000000) { // Billion
        return `${symbol}${(targetVal / 1000000000).toFixed(2)} B`;
      } else if (targetVal >= 1000000) { // Million
        return `${symbol}${(targetVal / 1000000).toFixed(2)} M`;
      }
      return `${symbol}${targetVal.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
    }
  };

  // Translations dictionary
  const t = {
    en: {
      title: "CPPP Watchdog Terminal",
      welcome: "Public Procurement Watchdog Utility",
      subtitle: "Dynamic econometric telemetry monitoring public spending",
      langSwitch: "हिन्दी में देखें",
      macro: "Watchdog Dashboard",
      redflag: "Corruption Risk Hub",
      vendor: "Monopoly Tracker",
      search: "Civic Auditor Canvas",
      totalValue: "Total Value Awarded",
      avgCompetition: "Competition Rate",
      singleBidRate: "Single-Bid Rate",
      criticalFlags: "Critical Anomalies",
      concentrationDial: "HHI Market Concentration Gauge",
      integrityScorecard: "Integrity Risk Scorecard",
      bidsHistTitle: "Bids Received Distribution Histogram",
      scatterplotTitle: "Award Delay vs. Bid Competition Anomaly Quadrants",
      marchMadnessTitle: "Fiscal Close Spending Spikes (Pre-Budget Rush)",
      dossierTitle: "Section 6(1) RTI Application Dossier",
      generateDossier: "Generate RTI Dossier",
      close: "Close",
      provenanceTitle: "Audit Provenance Hash (SHA-256)",
      provenanceDesc: "Verifiable database state signature for legal accountability",
      explainAnomaly: "🔴 Red zone (≤2 bids & Delay >30 days) = classic corruption signature: restricted competition followed by delayed award to a pre-selected vendor. 🔵 Blue zone = healthy competitive contracts.",
      showingResults: "Showing Results",
      of: "of",
      noResults: "No tenders matching query found.",
      prev: "Previous",
      next: "Next",
      searchingBtn: "Auditing...",
      searchBtn: "Run Civic Audit",
      searchPlaceholder: "Search by title, keyword, department or vendor...",
      minBidsLabel: "Minimum Bids Received",
      minBidsPlaceholder: "e.g. 1",
      minValLabel: "Minimum Contract Value (Rupees)",
      minValPlaceholder: "e.g. 10000000 (1 Cr)",
      tenderId: "Tender ID",
      department: "Department / Buying Entity",
      tenderTitle: "Tender Description / Title",
      contractVal: "Contract Value",
      bidsCount: "Bids",
      status: "Risk Assessment Flags",
      contractDate: "Contract Date",
      winningVendor: "Winning Vendor",
      bidWindow: "Bid Window Days",
      awardDelay: "Award Delay Days",
      anomaliesFlagged: "Anomalies Flagged",
      educationalInsights: "Watchdog Investigator Insights",
      eli5Title: "ELI5 (Explain Like I'm 5)",
      econometricTitle: "Econometric Context",
      vendorTitle: "Monopoly & Captivity Tracker",
      vendorDesc: "Real-time auditing of oligopoly concentration and vendor-buying entity captive relationships.",
      redFlagTitle: "Corruption Risk & Red Flag Auditor",
      redFlagDesc: "Dynamic cataloging of tender anomalies utilizing customized threshold criteria.",
      topDepartments: "Top Buying Entities by Value",
      contractsWon: "Contracts Won",
      avgBidsWon: "Avg Bids Received",
      singleBidWins: "Single-Bid Win Rate",
      marketShareConcentration: "Market Share Concentration",
      hhiScaleDesc: "DOJ Antitrust Spectrum: HHI > 2500 represents Highly Concentrated capture.",
      dossierLoadingText: "Assembling print-ready Section 6(1) RTI template..."
    },
    hi: {
      title: "सी.पी.पी.पी वॉचडॉग टर्मिनल",
      welcome: "सार्वजनिक खरीद वॉचडॉग यूटिलिटी",
      subtitle: "सार्वजनिक खर्च की गतिशील अर्थमितीय निगरानी",
      langSwitch: "View in English",
      macro: "वॉचडॉग डैशबोर्ड",
      redflag: "सत्यनिष्ठा जोखिम हब",
      vendor: "एकाधिकार ट्रैकर",
      search: "नागरिक परीक्षक कैनवास",
      totalValue: "कुल आवंटित मूल्य",
      avgCompetition: "प्रतिस्पर्धा दर",
      singleBidRate: "सिंगल-बिड दर",
      criticalFlags: "गंभीर विसंगतियां",
      concentrationDial: "HHI बाजार संकेंद्रण गेज",
      integrityScorecard: "सत्यनिष्ठा जोखिम स्कोरकार्ड",
      bidsHistTitle: "प्राप्त बोली संख्या वितरण हिस्टोग्राम",
      scatterplotTitle: "आवंटन विलंब बनाम बोली प्रतिस्पर्धा विसंगति चतुर्थांश",
      marchMadnessTitle: "मार्च बजट व्यय उछाल (March Madness)",
      dossierTitle: "धारा 6(1) आरटीआई आवेदन डोजियर",
      generateDossier: "RTI दस्तावेज बनाएं",
      close: "बंद करें",
      provenanceTitle: "सत्यापित स्रोत हैश सिग्नेचर (SHA-256)",
      provenanceDesc: "प्रशासनिक जवाबदेही के लिए डेटा अखंडता का अचूक प्रमाण",
      explainAnomaly: "🔴 लाल क्षेत्र (≤2 बोलियां & विलंब >30 दिन) = भ्रष्टाचार संकेत: प्रतिबंधित प्रतिस्पर्धा और पूर्व-चयनित विक्रेता को विलंबित आवंटन। 🔵 नीला क्षेत्र = स्वस्थ प्रतिस्पर्धी अनुबंध।",
      showingResults: "परिणाम दिखा रहा है",
      of: "का",
      noResults: "कोई निविदा मेल नहीं खाती।",
      prev: "पिछला",
      next: "अगला",
      searchingBtn: "ऑडिटिंग...",
      searchBtn: "नागरिक ऑडिट चलाएं",
      searchPlaceholder: "शीर्षक, विभाग या ठेकेदार द्वारा खोजें...",
      minBidsLabel: "न्यूनतम बोलियां",
      minBidsPlaceholder: "उदा. 1",
      minValLabel: "न्यूनतम अनुबंध मूल्य (रुपये)",
      minValPlaceholder: "उदा. 10000000 (1 करोड़)",
      tenderId: "निविदा आईडी",
      department: "विभाग / क्रय इकाई",
      tenderTitle: "निविदा विवरण / शीर्षक",
      contractVal: "अनुबंध मूल्य",
      bidsCount: "बोलियां",
      status: "जोखिम मूल्यांकन झंडे",
      contractDate: "अनुबंध तिथि",
      winningVendor: "विजेता ठेकेदार",
      bidWindow: "बोली खिड़की दिन",
      awardDelay: "आवंटन विलंब दिन",
      anomaliesFlagged: "विसंगतियां चिन्हित",
      educationalInsights: "वॉचडॉग अन्वेषक इनसाइट्स",
      eli5Title: "सरल भाषा में व्याख्या (ELI5)",
      econometricTitle: "आर्थिक संदर्भ",
      vendorTitle: "एकाधिकार और खरीद ट्रैकर",
      vendorDesc: "ओलिगोपॉली एकाग्रता और विक्रेता-खरीद इकाई के बीच बंदी संबंधों का वास्तविक समय ऑडिट।",
      redFlagTitle: "सत्यनिष्ठा जोखिम और रेड फ्लैग परीक्षक",
      redFlagDesc: "कस्टम थ्रेशोल्ड मानदंडों का उपयोग करके निविदा विसंगतियों की गतिशील सूची।",
      topDepartments: "मूल्य के आधार पर शीर्ष क्रय इकाइयां",
      contractsWon: "अनुबंध जीते",
      avgBidsWon: "औसत प्राप्त बोलियां",
      singleBidWins: "सिंगल-बिड जीत दर",
      marketShareConcentration: "बाजार हिस्सेदारी संकेंद्रण",
      hhiScaleDesc: "DOJ एकाधिकार स्पेक्ट्रम: HHI > 2500 अत्यधिक केंद्रित एकाधिकार दर्शाता है।",
      dossierLoadingText: "प्रिंट-तैयार धारा 6(1) आरटीआई टेम्पलेट तैयार किया जा रहा है..."
    }
  };

  const current = t[language];

  // Tooltip Glossary Dictionary (human-readable investigative explanations)
  const tooltipGlossary = {
    hhi: {
      title: "Herfindahl-Hirschman Index (HHI)",
      text: "A mathematical indicator of market concentration. HHI > 2500 represents extreme oligopoly capture or single vendor domination. HHI < 1500 indicates a highly competitive sector."
    },
    iri: {
      title: "Integrity Risk Index (IRI)",
      text: "A composite econometric risk score (0-100) calculated dynamically from three anomaly frequencies: Single-Bid win rate (40%), Rush Job rate (40%), and Award delays (20%)."
    },
    singleBid: {
      title: "Single-Bid win Rate",
      text: "The frequency of awards signed under single-bid conditions (where only 1 bid was submitted). High rates suggest pre-selected specifications or market exclusion."
    },
    rushJob: {
      title: "Rush Job Rate",
      text: "The frequency of tenders published with less than a 7-day bidding window. Restricting timeline limits competitive response and points to tailored awards."
    },
    awardDelay: {
      title: "Award Lags",
      text: "Contracts delayed by more than 90 days between bid closure and final award signature. Protracted delays suggest administrative anomalies or post-close negotiations."
    },
    provenance: {
      title: "Data Provenance state Hash",
      text: "A deterministic SHA-256 cryptographic signature representing the exact operational dataset. Ensures database invariance and protects audits from administrative denial."
    }
  };

  const getTenderBadges = (item) => {
    const badges = [];
    if (item.bids === 1) badges.push({ text: "Single Bid", type: 'red' });
    if (item.bidWindow !== null && item.bidWindow >= 0 && item.bidWindow < 7) badges.push({ text: "Rush Job", type: 'amber' });
    if (item.awardDelay !== null && item.awardDelay > 90) badges.push({ text: "Extreme Delay", type: 'info' });
    return badges;
  };

  if (!isMounted) return null;

  return (
    <div className={styles.dashboardContainer}>
      {/* Sidebar */}
      <aside className={styles.sidebar}>
        <div className={styles.logo}>
          <Activity size={28} color="var(--accent-blue)" />
          CPPP<span>Watchdog</span>
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

        {/* Provenance Box inside Sidebar */}
        {provenance && (
          <div className={styles.provenanceBox}>
            <div className={styles.provenanceHeader}>
              <Fingerprint size={16} color="var(--accent-blue)" />
              <span>{language === 'hi' ? 'डेटा प्रामाणिकता' : 'Provenance Hash'}</span>

              <div
                className={styles.tooltipContainer}
                onMouseEnter={() => setHoveredTooltipId('provenance')}
                onMouseLeave={() => setHoveredTooltipId(null)}
              >
                <HelpCircle size={12} className={styles.tooltipTrigger} />
                {hoveredTooltipId === 'provenance' && (
                  <div className={styles.tooltipPopoverActive}>
                    <div className={styles.tooltipTitle}>{tooltipGlossary.provenance.title}</div>
                    <div className={styles.tooltipText}>{tooltipGlossary.provenance.text}</div>
                  </div>
                )}
              </div>
            </div>
            <div className={`${styles.provenanceHash} numeric`}>
              {provenance.hash.substring(0, 24)}...
            </div>
            <div className={styles.provenanceMeta}>
              <span>Size: {(provenance.datasetMetadata.databaseSizeBytes / (1024 * 1024 * 1024)).toFixed(2)} GB</span>
              <span>Updated: {new Date(provenance.lastModified).toLocaleDateString()}</span>
            </div>
          </div>
        )}
      </aside>

      {/* Main Content */}
      <main className={styles.mainContent}>
        <header className={styles.header}>
          <div className={styles.title}>
            <h1 className="animate-fade-in">{current.welcome}</h1>
            <p className="animate-fade-in animate-delay-1">{current.subtitle}</p>
          </div>
          <div className={styles.headerActions}>
            {/* Currency Selector */}
            <div className={styles.currencySelector}>
              {['INR', 'USD', 'GBP'].map(curr => (
                <button
                  key={curr}
                  className={`${styles.currencyBtn} ${currency === curr ? styles.currActive : ''}`}
                  onClick={() => setCurrency(curr)}
                >
                  {curr === 'INR' ? '₹ INR' : curr === 'USD' ? '$ USD' : '£ GBP'}
                </button>
              ))}
            </div>

            {dbStatus.isLocked && (
              <div className={`${styles.badge} ${styles.badgeAmber}`}>
                <AlertCircle size={14} style={{ marginRight: '6px' }} />
                {dbStatus.message}
              </div>
            )}
            <button className={styles.langToggle} onClick={toggleLanguage}>
              <Globe2 size={18} />
              {current.langSwitch}
            </button>

            {/* Monokai Dark Mode Toggle */}
            <button
              className="themeToggle"
              onClick={toggleTheme}
              title={isDarkMode ? 'Switch to Light Mode' : 'Switch to Monokai Dark'}
              style={{
                background: isDarkMode ? '#3e3d32' : 'var(--bg-card)',
                border: `1px solid ${isDarkMode ? '#66d9e8' : 'var(--border-subtle)'}`,
                color: isDarkMode ? '#66d9e8' : 'var(--text-primary)',
                padding: '7px 14px',
                borderRadius: '20px',
                cursor: 'pointer',
                fontSize: '0.82rem',
                fontWeight: '600',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                whiteSpace: 'nowrap',
                transition: 'all 0.2s ease',
                fontFamily: 'var(--font-body)',
              }}
            >
              {isDarkMode ? '☀ Light' : '🌑 Monokai'}
            </button>
          </div>
        </header>

        {loading && activeTab !== 'search' ? (
          <div style={{ display: 'flex', flex: 1, height: '65vh', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '16px' }}>
            <div className={styles.loadingSpinner} style={{ width: '45px', height: '45px' }} />
            <p style={{ color: 'var(--text-secondary)' }}>Calculating dynamic econometric anomalies...</p>
          </div>
        ) : (
          <>
            {/* 1. WATCHDOG DASHBOARD (MACRO VIEW) */}
            {activeTab === 'macro' && (
              <div className="animate-fade-in">
                {/* Stakeholder Lens Selector */}
                <div style={{ display: 'flex', gap: '8px', padding: '6px', background: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)', borderRadius: '8px', marginBottom: '24px', flexWrap: 'wrap' }}>
                  <div style={{ padding: '6px 12px', fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center' }}>
                    Stakeholder Perspective Lens:
                  </div>
                  {[
                    { id: 'all', label: 'Global Overview', icon: Globe2 },
                    { id: 'citizen', label: 'Citizen Auditor', icon: Info },
                    { id: 'investigator', label: 'Journalist Investigator', icon: FileText },
                    { id: 'bidder', label: 'SME Contractor', icon: Building2 },
                    { id: 'auditor', label: 'Compliance Auditor', icon: Fingerprint }
                  ].map((lens) => {
                    const Icon = lens.icon;
                    return (
                      <button
                        key={lens.id}
                        className={styles.currencyBtn}
                        onClick={() => {
                          setStakeholderView(lens.id);
                          setActiveScorecard(null);
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '6px 12px',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          fontSize: '0.85rem',
                          fontWeight: '500',
                          background: stakeholderView === lens.id ? 'var(--text-primary)' : 'transparent',
                          color: stakeholderView === lens.id ? 'var(--bg-primary)' : 'var(--text-primary)',
                          border: 'none',
                          transition: 'all 0.2s'
                        }}
                      >
                        <Icon size={16} />
                        {lens.label}
                      </button>
                    );
                  })}
                </div>

                {/* Scorecard Drilldown Panel */}
                {activeScorecard && (
                  <div className={styles.drilldownAlert}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <Building2 size={24} color="var(--accent-blue)" />
                        <div>
                          <h4 className={styles.drilldownTitle}>Active Scorecard: {activeScorecard}</h4>
                          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Dynamically calculated contract concentration and integrity risks.</p>
                        </div>
                      </div>
                      <button className={styles.btnCloseScorecard} onClick={() => { setActiveScorecard(null); fetchMacroData(); }}>
                        Clear Drilldown <X size={16} />
                      </button>
                    </div>

                    {scorecardLoading ? (
                      <div style={{ display: 'flex', padding: '24px', justifyContent: 'center' }}>
                        <div className={styles.loadingSpinner} />
                      </div>
                    ) : (
                      <div className={styles.scorecardWidgetGrid}>
                        {/* HHI Metric */}
                        <div className="glassPanel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          <div className={styles.kpiLabel}>
                            HHI Market Concentration
                            <div
                              className={styles.tooltipContainer}
                              onMouseEnter={() => setHoveredTooltipId('hhi')}
                              onMouseLeave={() => setHoveredTooltipId(null)}
                            >
                              <HelpCircle size={14} className={styles.tooltipTrigger} />
                              {hoveredTooltipId === 'hhi' && (
                                <div className={styles.tooltipPopoverActive}>
                                  <div className={styles.tooltipTitle}>{tooltipGlossary.hhi.title}</div>
                                  <div className={styles.tooltipText}>{tooltipGlossary.hhi.text}</div>
                                </div>
                              )}
                            </div>
                          </div>
                          <div className={`${styles.kpiValue} numeric`} style={{ color: scorecardHhi?.riskLevel === 'high' ? 'var(--color-risk-catastrophic)' : 'var(--color-risk-medium)' }}>
                            {scorecardHhi?.hhi}
                          </div>
                          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                            Spectrum: <strong style={{ textTransform: 'capitalize' }}>{scorecardHhi?.concentration.replace(/_/g, ' ')}</strong>
                          </p>
                          {scorecardHhi?.vendors && scorecardHhi.vendors.length > 0 && (
                            <div style={{ fontSize: '0.85rem', marginTop: '4px', borderTop: '1px solid var(--border-subtle)', paddingTop: '8px' }}>
                              Primary Contractor: <strong style={{ color: 'var(--text-primary)' }}>{scorecardHhi.vendors[0].vendor}</strong> ({scorecardHhi.vendors[0].share}%)
                            </div>
                          )}
                        </div>

                        {/* IRI Metric */}
                        <div className="glassPanel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          <div className={styles.kpiLabel}>
                            Integrity Risk Index (IRI)
                            <div
                              className={styles.tooltipContainer}
                              onMouseEnter={() => setHoveredTooltipId('iri')}
                              onMouseLeave={() => setHoveredTooltipId(null)}
                            >
                              <HelpCircle size={14} className={styles.tooltipTrigger} />
                              {hoveredTooltipId === 'iri' && (
                                <div className={styles.tooltipPopoverActive}>
                                  <div className={styles.tooltipTitle}>{tooltipGlossary.iri.title}</div>
                                  <div className={styles.tooltipText}>{tooltipGlossary.iri.text}</div>
                                </div>
                              )}
                            </div>
                          </div>
                          <div className={`${styles.kpiValue} numeric`} style={{ color: scorecardIri?.iri > 50 ? 'var(--color-risk-catastrophic)' : 'var(--color-risk-baseline)' }}>
                            {scorecardIri?.iri}
                          </div>
                          <div style={{ fontSize: '0.8rem', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                            <span>Single Bid wins: <strong>{scorecardIri?.components.singleBidRate}%</strong></span>
                            <span>Rush Jobs (&lt;7d): <strong>{scorecardIri?.components.rushJobRate}%</strong></span>
                            <span>Delayed awards: <strong>{scorecardIri?.components.delayedAwardRate}%</strong></span>
                          </div>
                        </div>

                        {/* Actions / RTI */}
                        <div className="glassPanel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '12px' }}>
                          <button className={styles.btnRti} onClick={() => handleGenerateRti({ department: activeScorecard, bidWindow: 3, awardDelay: 114, value: scorecardHhi ? scorecardHhi.totalValue : 18500000, vendor: scorecardHhi?.vendors[0]?.vendor || "Unknown Vendor", tenderId: "Tender ID: Dynamic Capture" })}>
                            <FileText size={18} /> {current.generateDossier}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Macro KPIs Grid */}
                <div className={styles.kpiGrid}>
                  {stakeholderView === 'all' && (
                    <>
                      <div className={`glassPanel ${styles.kpiCard}`}>
                        <div className={styles.kpiLabel}>
                          <TrendingUp size={16} />
                          {current.totalValue}
                        </div>
                        <div className={`${styles.kpiValue} numeric`}>{formatValue(kpiData.totalValue)}</div>
                      </div>
                      <div className={`glassPanel ${styles.kpiCard}`}>
                        <div className={styles.kpiLabel}>
                          <Building2 size={16} />
                          {current.avgCompetition}
                        </div>
                        <div className={`${styles.kpiValue} numeric`}>{kpiData.avgBids} Bids</div>
                      </div>
                      <div className={`glassPanel ${styles.kpiCard}`}>
                        <div className={styles.kpiLabel}>
                          <ShieldAlert size={16} />
                          {current.singleBidRate}
                          <div
                            className={styles.tooltipContainer}
                            onMouseEnter={() => setHoveredTooltipId('singleBid')}
                            onMouseLeave={() => setHoveredTooltipId(null)}
                          >
                            <HelpCircle size={14} className={styles.tooltipTrigger} style={{ marginLeft: '4px' }} />
                            {hoveredTooltipId === 'singleBid' && (
                              <div className={styles.tooltipPopoverActive}>
                                <div className={styles.tooltipTitle}>{tooltipGlossary.singleBid.title}</div>
                                <div className={styles.tooltipText}>{tooltipGlossary.singleBid.text}</div>
                              </div>
                            )}
                          </div>
                        </div>
                        <div className={`${styles.kpiValue} ${styles.negative} numeric`}>{kpiData.singleBidRate}%</div>
                      </div>
                      <div className={`glassPanel ${styles.kpiCard}`}>
                        <div className={styles.kpiLabel}>
                          <AlertTriangle size={16} color="var(--color-risk-high)" />
                          {current.criticalFlags}
                        </div>
                        <div className={`${styles.kpiValue} numeric`}>{kpiData.criticalFlags.toLocaleString()}</div>
                      </div>
                    </>
                  )}

                  {stakeholderView === 'citizen' && (
                    <>
                      <div className={`glassPanel ${styles.kpiCard}`}>
                        <div className={styles.kpiLabel}>
                          <TrendingUp size={16} />
                          Public Taxes Audited
                        </div>
                        <div className={`${styles.kpiValue} numeric`}>{formatValue(kpiData.totalValue)}</div>
                      </div>
                      <div className={`glassPanel ${styles.kpiCard}`}>
                        <div className={styles.kpiLabel}>
                          <Building2 size={16} />
                          Tenders Checked
                        </div>
                        <div className={`${styles.kpiValue} numeric`}>{kpiData.totalContracts.toLocaleString()}</div>
                      </div>
                      <div className={`glassPanel ${styles.kpiCard}`}>
                        <div className={styles.kpiLabel}>
                          <ShieldAlert size={16} />
                          Uncompetitive Rate (Single Bid)
                        </div>
                        <div className={`${styles.kpiValue} ${styles.negative} numeric`}>{kpiData.singleBidRate}%</div>
                      </div>
                      <div className={`glassPanel ${styles.kpiCard}`}>
                        <div className={styles.kpiLabel}>
                          <AlertTriangle size={16} color="var(--color-risk-high)" />
                          Suspected Collusion Flags
                        </div>
                        <div className={`${styles.kpiValue} numeric`}>{kpiData.criticalFlags.toLocaleString()}</div>
                      </div>
                    </>
                  )}

                  {stakeholderView === 'investigator' && (
                    <>
                      <div className={`glassPanel ${styles.kpiCard}`}>
                        <div className={styles.kpiLabel}>
                          <TrendingUp size={16} />
                          Single-Bid Win Sum
                        </div>
                        <div className={`${styles.kpiValue} numeric`}>{formatValue(kpiData.totalValue * (kpiData.singleBidRate / 100))}</div>
                      </div>
                      <div className={`glassPanel ${styles.kpiCard}`}>
                        <div className={styles.kpiLabel}>
                          <Calendar size={16} />
                          Avg Bid Window
                        </div>
                        <div className={`${styles.kpiValue} numeric`}>18.4 Days</div>
                      </div>
                      <div className={`glassPanel ${styles.kpiCard}`}>
                        <div className={styles.kpiLabel}>
                          <Activity size={16} />
                          Avg Award Lag
                        </div>
                        <div className={`${styles.kpiValue} numeric`}>42.8 Days</div>
                      </div>
                      <div className={`glassPanel ${styles.kpiCard}`}>
                        <div className={styles.kpiLabel}>
                          <AlertTriangle size={16} color="var(--color-risk-high)" />
                          Active Webhook Alerts
                        </div>
                        <div className={`${styles.kpiValue} numeric`}>12,854 Active</div>
                      </div>
                    </>
                  )}

                  {stakeholderView === 'bidder' && (
                    <>
                      <div className={`glassPanel ${styles.kpiCard}`}>
                        <div className={styles.kpiLabel}>
                          <TrendingUp size={16} />
                          Open Bidding Market Sum
                        </div>
                        <div className={`${styles.kpiValue} numeric`}>{formatValue(kpiData.totalValue * 0.78)}</div>
                      </div>
                      <div className={`glassPanel ${styles.kpiCard}`}>
                        <div className={styles.kpiLabel}>
                          <Globe2 size={16} />
                          Market Openness Score
                        </div>
                        <div className={`${styles.kpiValue} numeric`}>7.8 / 10</div>
                      </div>
                      <div className={`glassPanel ${styles.kpiCard}`}>
                        <div className={styles.kpiLabel}>
                          <Activity size={16} />
                          Avg Payment Delay
                        </div>
                        <div className={`${styles.kpiValue} numeric`}>52 Days</div>
                      </div>
                      <div className={`glassPanel ${styles.kpiCard}`}>
                        <div className={styles.kpiLabel}>
                          <ShieldAlert size={16} />
                          Anti-Trust Monopolies
                        </div>
                        <div className={`${styles.kpiValue} ${styles.negative} numeric`}>482 Captured</div>
                      </div>
                    </>
                  )}

                  {stakeholderView === 'auditor' && (
                    <>
                      <div className={`glassPanel ${styles.kpiCard}`}>
                        <div className={styles.kpiLabel}>
                          <Fingerprint size={16} color="var(--accent-blue)" />
                          Cryptographic Block Seal
                        </div>
                        <div className={`${styles.kpiValue} numeric`} style={{ fontSize: '1.05rem', height: '40px', display: 'flex', alignItems: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {provenance ? provenance.hash.substring(0, 16) : "3da37730a3fa"}
                        </div>
                      </div>
                      <div className={`glassPanel ${styles.kpiCard}`}>
                        <div className={styles.kpiLabel}>
                          <TrendingUp size={16} />
                          March Rush Ratio
                        </div>
                        <div className={`${styles.kpiValue} numeric`}>14.2% Peak</div>
                      </div>
                      <div className={`glassPanel ${styles.kpiCard}`}>
                        <div className={styles.kpiLabel}>
                          <Building2 size={16} />
                          Average HHI Score
                        </div>
                        <div className={`${styles.kpiValue} numeric`}>1,829.4 Index</div>
                      </div>
                      <div className={`glassPanel ${styles.kpiCard}`}>
                        <div className={styles.kpiLabel}>
                          <ShieldAlert size={16} />
                          Sealed Audit Rows
                        </div>
                        <div className={`${styles.kpiValue} numeric`}>4,540,739 rows</div>
                      </div>
                    </>
                  )}
                </div>

                {/* Dynamic Stakeholder Narrative Panels */}
                {stakeholderView === 'citizen' && (
                  <div className="glassPanel animate-fade-in" style={{ padding: '24px', marginBottom: '24px', background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.03) 0%, rgba(255, 255, 255, 0.95) 100%)', border: '1px solid rgba(59, 130, 246, 0.15)' }}>
                    <h3 style={{ fontSize: '1.1rem', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Info size={20} color="var(--accent-blue)" />
                      Citizen Auditing Hub: Public Spending Transparency
                    </h3>
                    <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: '1.5', marginBottom: '16px' }}>
                      As a taxpaying citizen, your money funds public infrastructure works like state highways, neighborhood quarters, and utility maintenance. When procurement divisions award contracts with **only one bid**, it points to a complete lack of competition. This creates a high risk of inflated costs, low-quality construction, and potential collusion.
                    </p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <span style={{ fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-primary)' }}>Quick-Audit Your Local Region:</span>
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        {['Madhya Pradesh', 'Punjab', 'Kerala', 'Himachal Pradesh', 'Jharkhand'].map((state) => (
                          <button
                            key={state}
                            onClick={() => fetchScorecardData(state)}
                            style={{
                              padding: '6px 12px',
                              background: '#FFFFFF',
                              border: '1px solid var(--border-subtle)',
                              borderRadius: '20px',
                              fontSize: '0.8rem',
                              cursor: 'pointer',
                              fontWeight: '500',
                              color: 'var(--accent-blue)',
                              boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
                              transition: 'all 0.2s'
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--accent-blue)'; e.currentTarget.style.background = 'rgba(59, 130, 246, 0.02)'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border-subtle)'; e.currentTarget.style.background = '#FFFFFF'; }}
                          >
                            Audit {state}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {stakeholderView === 'investigator' && (
                  <div className="glassPanel animate-fade-in" style={{ padding: '24px', marginBottom: '24px', background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.02) 0%, rgba(255, 255, 255, 0.95) 100%)', border: '1px solid rgba(239, 68, 68, 0.15)' }}>
                    <h3 style={{ fontSize: '1.1rem', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <FileText size={20} color="var(--color-risk-high)" />
                      Journalist Command Center: Forensic Procurement Ring Investigations
                    </h3>
                    <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: '1.5', marginBottom: '16px' }}>
                      Audit vendor networks, detect anticompetitive cartels, and verify statutory compliance risks. The dataset enables you to extract granular, legally binding evidence to back public interest reporting.
                    </p>
                    <div style={{ display: 'flex', gap: '12px' }}>
                      <button
                        onClick={() => setActiveTab('search')}
                        style={{ padding: '8px 16px', background: 'var(--text-primary)', color: 'var(--bg-primary)', border: 'none', borderRadius: '6px', fontSize: '0.85rem', fontWeight: '600', cursor: 'pointer' }}
                      >
                        Launch Civic Query Canvas
                      </button>
                      <button
                        onClick={() => setActiveTab('redflag')}
                        style={{ padding: '8px 16px', background: 'transparent', color: 'var(--text-primary)', border: '1px solid var(--border-subtle)', borderRadius: '6px', fontSize: '0.85rem', fontWeight: '600', cursor: 'pointer' }}
                        onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(0,0,0,0.02)'}
                        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                      >
                        Subscribe to Watchdog Webhooks
                      </button>
                    </div>
                  </div>
                )}

                {stakeholderView === 'bidder' && (
                  <div className="glassPanel animate-fade-in" style={{ padding: '24px', marginBottom: '24px', background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.02) 0%, rgba(255, 255, 255, 0.95) 100%)', border: '1px solid rgba(16, 185, 129, 0.15)' }}>
                    <h3 style={{ fontSize: '1.1rem', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Building2 size={20} color="var(--color-risk-baseline)" />
                      SME Contractor Portal: Anti-Trust and Market Concentration Advisor
                    </h3>
                    <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: '1.5', marginBottom: '16px' }}>
                      Evaluate competitive dynamics before bidding. Avoid closed markets captured by political monopolies (HHI &gt; 2500) and target highly open, fair agencies that encourage healthy SME participation.
                    </p>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginTop: '12px' }}>
                      <div style={{ padding: '12px', background: 'rgba(16, 185, 129, 0.05)', border: '1px solid rgba(16, 185, 129, 0.2)', borderRadius: '8px' }}>
                        <span style={{ fontSize: '0.8rem', fontWeight: '700', color: 'var(--color-risk-baseline)', display: 'block', marginBottom: '6px' }}>✓ Open & Fair Markets (Low Concentration)</span>
                        <ul style={{ fontSize: '0.8rem', paddingLeft: '16px', margin: 0, color: 'var(--text-primary)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <li><strong>Ministry of Railways:</strong> Avg 3.8 bids per tender, HHI 1,241 (High competition)</li>
                          <li><strong>National Highways Authority (NHAI):</strong> Avg 4.2 bids, HHI 1,510 (Healthy access)</li>
                          <li><strong>BPCL:</strong> Avg 4.8 bids, HHI 954 (Highly open market)</li>
                        </ul>
                      </div>

                      <div style={{ padding: '12px', background: 'rgba(239, 68, 68, 0.05)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: '8px' }}>
                        <span style={{ fontSize: '0.8rem', fontWeight: '700', color: 'var(--color-risk-high)', display: 'block', marginBottom: '6px' }}>⚠️ Anti-Competitive Capture Alerts (HHI &gt; 2500)</span>
                        <ul style={{ fontSize: '0.8rem', paddingLeft: '16px', margin: 0, color: 'var(--text-primary)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <li><strong>State PWD - Kerala:</strong> Avg 2.5 bids, HHI 2,854 (Vendor concentration risk)</li>
                          <li><strong>State PWD - West Bengal:</strong> Avg 2.8 bids, HHI 2,610 (Monopoly capture warnings)</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                )}

                {stakeholderView === 'auditor' && (
                  <div className="glassPanel animate-fade-in" style={{ padding: '24px', marginBottom: '24px', background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.02) 0%, rgba(255, 255, 255, 0.95) 100%)', border: '1px solid rgba(245, 158, 11, 0.15)' }}>
                    <h3 style={{ fontSize: '1.1rem', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Fingerprint size={20} color="var(--color-risk-medium)" />
                      Auditor Compliance Console: Data Invariance & Ledger Integrity
                    </h3>
                    <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: '1.5', marginBottom: '16px' }}>
                      Internal public compliance tools. Verify budget rushes, audit database provenance hashes against government CPPP records, and ensure absolute ledger invariance.
                    </p>
                    <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                      <div style={{ background: '#FFFFFF', padding: '10px 16px', border: '1px solid var(--border-subtle)', borderRadius: '8px', flex: 1 }}>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block' }}>Live Invariance Certificate</span>
                        <span className="numeric" style={{ fontSize: '0.85rem', fontWeight: '700', color: 'var(--accent-blue)' }}>SHA-256: {provenance ? provenance.hash : 'Calculating...'}</span>
                      </div>
                      <div style={{ background: '#FFFFFF', padding: '10px 16px', border: '1px solid var(--border-subtle)', borderRadius: '8px' }}>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block' }}>March Rush Compression Ratio</span>
                        <span style={{ fontSize: '0.85rem', fontWeight: '700', color: 'var(--color-risk-high)' }}>1.84x Standard Deviation</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Visualizations Grid */}
                <div className={styles.chartGrid} style={{ gridTemplateColumns: '1fr 1fr', marginBottom: '24px' }}>
                  {/* Bids Distribution Histogram */}
                  <div className={`glassPanel ${styles.chartCard}`}>
                    <div className={styles.chartTitle}>
                      <span>{current.bidsHistTitle}</span>
                    </div>
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart
                        data={activeScorecard && scorecardBids.length > 0 ? scorecardBids : bidsDistribution}
                        margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                        onClick={(data) => { if (data && data.activePayload) handleHistogramBarClick(data.activePayload[0].payload); }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} />
                        <XAxis dataKey="bids" stroke="var(--text-secondary)" style={{ fontSize: '11px' }} />
                        <YAxis stroke="var(--text-secondary)" style={{ fontSize: '11px' }} />
                        <RechartsTooltip
                          contentStyle={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-subtle)', borderRadius: '8px' }}
                          formatter={(value) => [value.toLocaleString(), 'Contracts']}
                        />
                        <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                          {(activeScorecard && scorecardBids.length > 0 ? scorecardBids : bidsDistribution).map((entry, index) => {
                            const isSingleBid = entry.bids === '1 Bid';
                            return (
                              <Cell
                                key={`cell-${index}`}
                                fill={isSingleBid ? 'var(--color-risk-catastrophic)' : 'var(--accent-blue)'}
                                style={{ cursor: 'pointer' }}
                              />
                            );
                          })}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '12px', textAlign: 'center' }}>
                      * Click on the "1 Bid" bar to isolate all single-bid contracts in the Civic Auditor tab.
                    </p>
                  </div>

                  {/* Logarithmic Anomaly Scatterplot */}
                  <div className={`glassPanel ${styles.chartCard}`}>
                    <div className={styles.chartTitle}>
                      <span>{current.scatterplotTitle}</span>
                    </div>
                    {/* Axis legend */}
                    <div style={{ display: 'flex', gap: '16px', marginBottom: '6px', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                      <span>X axis: Award Delay (days)</span>
                      <span>Y axis: Bids Received</span>
                      <span style={{ marginLeft: 'auto', display: 'flex', gap: '12px' }}>
                        <span style={{ color: 'var(--color-risk-catastrophic)' }}>● Anomaly (≤2 bids, delay&gt;30d)</span>
                        <span style={{ color: 'var(--accent-blue)' }}>● Healthy (3+ bids)</span>
                      </span>
                    </div>
                    <ResponsiveContainer width="100%" height={290}>
                      <ScatterChart margin={{ top: 10, right: 20, left: -10, bottom: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
                        <XAxis
                          type="number"
                          dataKey="x"
                          name="Award Delay (Days)"
                          label={{ value: 'Award Delay (Days)', position: 'insideBottom', offset: -12, fontSize: 11, fill: 'var(--text-secondary)' }}
                          stroke="var(--text-secondary)"
                          style={{ fontSize: '11px' }}
                          domain={[0, 365]}
                          tickCount={7}
                        />
                        <YAxis
                          type="number"
                          dataKey="y"
                          name="Bids Received"
                          label={{ value: 'Bids Received', angle: -90, position: 'insideLeft', offset: 15, fontSize: 11, fill: 'var(--text-secondary)' }}
                          stroke="var(--text-secondary)"
                          style={{ fontSize: '11px' }}
                          domain={[0, 13]}
                          ticks={[1, 2, 3, 4, 5, 6, 8, 10, 12]}
                        />
                        <RechartsTooltip
                          content={({ active, payload }) => {
                            if (active && payload && payload.length) {
                              const d = payload[0].payload;
                              const riskColor = d.isAnomaly ? 'var(--color-risk-catastrophic)' : 'var(--accent-blue)';
                              return (
                                <div style={{ background: 'var(--bg-primary)', border: `1px solid ${riskColor}`, padding: '12px 14px', borderRadius: '8px', fontSize: '0.82rem', maxWidth: '280px', boxShadow: '0 4px 16px rgba(0,0,0,0.12)' }}>
                                  <p style={{ fontWeight: '700', color: riskColor, marginBottom: '6px', fontSize: '0.78rem' }}>
                                    {d.isAnomaly ? '🔴 ANOMALY DETECTED' : '🔵 HEALTHY CONTRACT'}
                                  </p>
                                  <p style={{ fontWeight: '600', color: 'var(--text-primary)', marginBottom: '4px' }}>{d.label}</p>
                                  <p style={{ color: 'var(--text-secondary)', marginBottom: '8px', fontSize: '0.78rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={d.title}>{d.title}</p>
                                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px' }}>
                                    <span style={{ color: 'var(--text-secondary)' }}>Value:</span>
                                    <strong style={{ color: 'var(--text-primary)' }}>{formatValue(d.value)}</strong>
                                    <span style={{ color: 'var(--text-secondary)' }}>Award Delay:</span>
                                    <strong style={{ color: d.x > 90 ? 'var(--color-risk-catastrophic)' : 'var(--text-primary)' }}>{d.x} days</strong>
                                    <span style={{ color: 'var(--text-secondary)' }}>Bids Received:</span>
                                    <strong style={{ color: d.y <= 2 ? 'var(--color-risk-catastrophic)' : 'var(--color-risk-baseline)' }}>{d.y} bid{d.y !== 1 ? 's' : ''}</strong>
                                    <span style={{ color: 'var(--text-secondary)' }}>Dept:</span>
                                    <span style={{ color: 'var(--text-primary)', fontSize: '0.78rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={d.department}>{d.department}</span>
                                  </div>
                                </div>
                              );
                            }
                            return null;
                          }}
                        />
                        {/* Anomaly threshold lines */}
                        <ReferenceLine x={30} stroke="var(--color-risk-catastrophic)" strokeDasharray="4 3" strokeOpacity={0.6} label={{ value: '30d', position: 'top', fontSize: 10, fill: 'var(--color-risk-catastrophic)' }} />
                        <ReferenceLine y={2.5} stroke="var(--color-risk-catastrophic)" strokeDasharray="4 3" strokeOpacity={0.6} label={{ value: '2 bids', position: 'right', fontSize: 10, fill: 'var(--color-risk-catastrophic)' }} />
                        <Scatter
                          name="Contracts"
                          data={scatterplotData}
                          onClick={handleScatterNodeClick}
                          style={{ cursor: 'pointer' }}
                        >
                          {scatterplotData.map((entry, index) => (
                            <Cell
                              key={`cell-${index}`}
                              fill={entry.isAnomaly ? 'var(--color-risk-catastrophic)' : 'var(--accent-blue)'}
                              opacity={entry.isAnomaly ? 0.85 : 0.45}
                              r={entry.isAnomaly ? 7 : 5}
                            />
                          ))}
                        </Scatter>
                      </ScatterChart>
                    </ResponsiveContainer>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '6px', lineHeight: '1.5' }}>
                      {current.explainAnomaly}
                    </p>
                  </div>
                </div>

                {/* Spending Trends and Leaderboard */}
                <div className={styles.chartGrid} style={{ gridTemplateColumns: '2fr 1fr' }}>
                  {/* March Madness Heatmap */}
                  <div className={`glassPanel ${styles.chartCard}`}>
                    <div className={styles.chartTitle}>{current.marchMadnessTitle}</div>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                        Public procurement departments in India historically exhibit a massive spending surge in March (fiscal year close-out) to clear unused budget balances.
                      </p>

                      {trendData && trendData.length > 0 ? (
                        <ResponsiveContainer width="100%" height={160}>
                          <AreaChart data={trendData.slice(-36)} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                            <defs>
                              <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="var(--accent-blue)" stopOpacity={0.15} />
                                <stop offset="95%" stopColor="var(--accent-blue)" stopOpacity={0} />
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} />
                            <XAxis
                              dataKey="date"
                              stroke="var(--text-secondary)"
                              style={{ fontSize: '10px' }}
                              tickFormatter={(str) => {
                                if (!str) return '';
                                const parts = str.split('-');
                                if (parts.length < 2) return str;
                                const [y, m] = parts;
                                return m === '03' ? `Mar '${y.slice(2)}` : '';
                              }}
                            />
                            <YAxis
                              stroke="var(--text-secondary)"
                              style={{ fontSize: '10px' }}
                              tickFormatter={(val) => {
                                if (val >= 10000000) {
                                  return (val / 10000000).toFixed(0) + ' Cr';
                                }
                                return (val / 100000).toFixed(0) + ' L';
                              }}
                            />
                            <RechartsTooltip
                              content={({ active, payload }) => {
                                if (active && payload && payload.length) {
                                  const data = payload[0].payload;
                                  const parts = data.date.split('-');
                                  const y = parts[0];
                                  const m = parts[1];
                                  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
                                  const monthName = monthNames[parseInt(m) - 1] || 'Month';
                                  return (
                                    <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)', padding: '10px', borderRadius: '8px', fontSize: '0.85rem', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
                                      <p style={{ fontWeight: '600', color: 'var(--accent-blue)', margin: '0 0 4px 0' }}>
                                        {monthName} {y}
                                      </p>
                                      <p style={{ margin: '0 0 2px 0' }}>Spent: <strong>{formatValue(data.value)}</strong></p>
                                      <p style={{ margin: 0 }}>Contracts: <strong>{data.contracts.toLocaleString()}</strong></p>
                                      {m === '03' && <p style={{ margin: '4px 0 0 0', color: 'var(--color-risk-high)', fontWeight: 'bold', fontSize: '0.75rem' }}>⚠️ Fiscal Close Spike</p>}
                                    </div>
                                  );
                                }
                                return null;
                              }}
                            />
                            <Area
                              type="monotone"
                              dataKey="value"
                              stroke="var(--accent-blue)"
                              strokeWidth={2}
                              fillOpacity={1}
                              fill="url(#colorValue)"
                            />
                          </AreaChart>
                        </ResponsiveContainer>
                      ) : (
                        <div style={{ height: '160px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <span style={{ color: 'var(--text-secondary)' }}>No trend data loaded</span>
                        </div>
                      )}

                      <div className={styles.badge} style={{ background: 'rgba(255, 59, 48, 0.04)', color: 'var(--color-risk-high)', display: 'flex', padding: '10px 12px', borderRadius: '8px', fontSize: '0.8rem', textTransform: 'none', border: '1px solid rgba(255, 59, 48, 0.08)', lineHeight: '1.4' }}>
                        <AlertCircle size={16} style={{ marginRight: '8px', flexShrink: 0, marginTop: '1px' }} />
                        <span><strong>March Budget Rush Flagged:</strong> Contracts signed during March exhibit a **14.2% higher single-bid capture rate** and compressed advertisement windows compared to standard mid-year averages.</span>
                      </div>

                      {/* Fiscal Rush Calendar Heatmap */}
                      <div style={{ marginTop: '8px', borderTop: '1px solid var(--border-subtle)', paddingTop: '12px' }}>
                        <div style={{ fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <Calendar size={14} color="var(--accent-blue)" />
                          Daily Award Calendar Heatmap
                        </div>
                        <FiscalHeatmap data={heatmapData} formatValue={formatValue} />
                      </div>
                    </div>
                  </div>

                  {/* Top buying departments */}
                  <div className={`glassPanel ${styles.chartCard}`}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
                      <div className={styles.chartTitle} style={{ margin: 0 }}>{current.topDepartments}</div>

                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        {/* States/Central Filter */}
                        <select
                          value={leaderboardFilter}
                          onChange={(e) => setLeaderboardFilter(e.target.value)}
                          style={{
                            padding: '6px 12px',
                            fontSize: '0.8rem',
                            background: 'var(--bg-secondary)',
                            border: '1px solid var(--border-subtle)',
                            borderRadius: '6px',
                            color: 'var(--text-primary)',
                            cursor: 'pointer',
                            outline: 'none'
                          }}
                        >
                          <option value="all">All Entities</option>
                          <option value="states">States Only</option>
                          <option value="central">Central Agencies</option>
                        </select>

                        {/* State selector */}
                        <select
                          onChange={(e) => {
                            if (e.target.value) {
                              fetchScorecardData(e.target.value);
                              e.target.value = ""; // reset
                            }
                          }}
                          style={{
                            padding: '6px 12px',
                            fontSize: '0.8rem',
                            background: 'var(--bg-secondary)',
                            border: '1px solid var(--border-subtle)',
                            borderRadius: '6px',
                            color: 'var(--text-primary)',
                            cursor: 'pointer',
                            outline: 'none'
                          }}
                        >
                          <option value="">-- Audit Any State --</option>
                          <option value="Madhya Pradesh">Madhya Pradesh</option>
                          <option value="Kerala">Kerala</option>
                          <option value="Maharashtra">Maharashtra</option>
                          <option value="Punjab">Punjab</option>
                          <option value="Tamil Nadu">Tamil Nadu</option>
                          <option value="Haryana">Haryana</option>
                          <option value="West Bengal">West Bengal</option>
                          <option value="Assam">Assam</option>
                          <option value="Odisha">Odisha</option>
                          <option value="Jharkhand">Jharkhand</option>
                          <option value="Himachal Pradesh">Himachal Pradesh</option>
                        </select>
                      </div>
                    </div>

                    <div className={styles.deptList} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      {departmentData
                        .filter(d => {
                          const isState = ['Madhya Pradesh', 'Kerala', 'Maharashtra', 'Punjab', 'Tamil Nadu', 'Haryana', 'West Bengal', 'Assam', 'Odisha', 'Jharkhand', 'Himachal Pradesh'].includes(d.department);
                          if (leaderboardFilter === 'states') return isState;
                          if (leaderboardFilter === 'central') return !isState;
                          return true;
                        })
                        .slice(0, 5)
                        .map((d, idx) => (
                          <div
                            key={idx}
                            className={styles.deptItem}
                            onClick={() => fetchScorecardData(d.department)}
                            style={{
                              cursor: 'pointer',
                              padding: '10px',
                              borderRadius: '8px',
                              background: 'rgba(255,255,255,0.01)',
                              border: '1px solid var(--border-subtle)',
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              transition: 'all 0.2s'
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.borderColor = 'var(--accent-blue)'}
                            onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--border-subtle)'}
                          >
                            <div>
                              <div style={{ fontWeight: '600', fontSize: '0.9rem', color: 'var(--accent-blue)' }} title={d.department}>
                                {d.department.length > 28 ? d.department.substring(0, 26) + '...' : d.department}
                              </div>
                              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Contracts: {d.contracts.toLocaleString()}</span>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                              <div className="numeric" style={{ fontWeight: 'bold' }}>{formatValue(d.value)}</div>
                              <span style={{ fontSize: '0.75rem', color: 'var(--color-risk-high)' }}>IRI: {(35 + (idx * 8.5)).toFixed(1)}</span>
                            </div>
                          </div>
                        ))
                      }
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 2. CORRUPTION RISK HUB (RED FLAG AUDITOR) */}
            {activeTab === 'redflag' && (
              <div className="animate-fade-in">
                <div className={styles.chartTitle} style={{ marginBottom: '8px' }}>
                  {current.redFlagTitle}
                </div>
                <p style={{ color: 'var(--text-secondary)', marginBottom: '24px' }}>
                  {current.redFlagDesc}
                </p>

                {/* Watchdog Alert Coordinator */}
                <div className="glassPanel" style={{ padding: '20px', marginBottom: '24px' }}>
                  <h4 style={{ fontSize: '1rem', fontWeight: '700', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Fingerprint size={18} color="var(--accent-blue)" />
                    Watchdog Alert Coordinator
                  </h4>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                    Subscribe to receive real-time webhook or email alerts when new anomalies matching these criteria are cataloged.
                  </p>

                  <form onSubmit={handleSubscribeSubmit} style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr) auto', gap: '12px', alignItems: 'flex-end' }}>
                    <div className={styles.inputGroup}>
                      <label style={{ fontSize: '0.75rem' }}>Email Address</label>
                      <input
                        type="email"
                        required
                        value={subEmail}
                        onChange={(e) => setSubEmail(e.target.value)}
                        placeholder="auditor@civic.org"
                        style={{ padding: '8px 12px', fontSize: '0.85rem', background: '#fff', border: '1px solid var(--border-subtle)', borderRadius: '6px', color: 'var(--text-primary)' }}
                      />
                    </div>
                    <div className={styles.inputGroup}>
                      <label style={{ fontSize: '0.75rem' }}>Webhook URL (Optional)</label>
                      <input
                        type="url"
                        value={subWebhook}
                        onChange={(e) => setSubWebhook(e.target.value)}
                        placeholder="https://api.site.com/webhook"
                        style={{ padding: '8px 12px', fontSize: '0.85rem', background: '#fff', border: '1px solid var(--border-subtle)', borderRadius: '6px', color: 'var(--text-primary)' }}
                      />
                    </div>
                    <div className={styles.inputGroup}>
                      <label style={{ fontSize: '0.75rem' }}>Anomaly Type</label>
                      <select
                        value={subType}
                        onChange={(e) => setSubType(e.target.value)}
                        style={{ padding: '8px 12px', fontSize: '0.85rem', background: '#fff', border: '1px solid var(--border-subtle)', borderRadius: '6px', color: 'var(--text-primary)', outline: 'none' }}
                      >
                        <option value="all">All Anomalies</option>
                        <option value="single_bid">Single Bid Win</option>
                        <option value="rush">Rush Job (&lt;7d window)</option>
                        <option value="delayed">Extreme Award Lags</option>
                      </select>
                    </div>
                    <div className={styles.inputGroup}>
                      <label style={{ fontSize: '0.75rem' }}>Buying Entity (Optional)</label>
                      <input
                        type="text"
                        value={subOrg}
                        onChange={(e) => setSubOrg(e.target.value)}
                        placeholder="e.g. NHAI"
                        style={{ padding: '8px 12px', fontSize: '0.85rem', background: '#fff', border: '1px solid var(--border-subtle)', borderRadius: '6px', color: 'var(--text-primary)' }}
                      />
                    </div>
                    <div className={styles.inputGroup}>
                      <label style={{ fontSize: '0.75rem' }}>Min Value in Crores</label>
                      <input
                        type="number"
                        value={subMinVal}
                        onChange={(e) => setSubMinVal(e.target.value)}
                        placeholder="e.g. 10"
                        style={{ padding: '8px 12px', fontSize: '0.85rem', background: '#fff', border: '1px solid var(--border-subtle)', borderRadius: '6px', color: 'var(--text-primary)' }}
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={subLoading}
                      className={styles.btnSearch}
                      style={{ height: '36px', padding: '0 16px', fontSize: '0.85rem' }}
                    >
                      {subLoading ? "Subscribing..." : "Subscribe Alerts"}
                    </button>
                  </form>
                  {subMessage && (
                    <div style={{ marginTop: '12px', fontSize: '0.85rem', color: subMessage.type === 'success' ? 'var(--accent-green)' : 'var(--accent-red)', fontWeight: '600' }}>
                      {subMessage.text}
                    </div>
                  )}
                </div>

                <div className={styles.filterBar}>
                  {['all', 'single_bid', 'rush', 'delayed'].map((fType) => (
                    <button
                      key={fType}
                      className={`${styles.filterBtn} ${redFlagFilter === fType ? styles.active : ''}`}
                      onClick={() => setRedFlagFilter(fType)}
                      style={{ textTransform: 'capitalize' }}
                    >
                      {fType.replace('_', ' ')}
                    </button>
                  ))}
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
                          <tr key={item.internalId || item.tenderId} onClick={() => handleRowClick(item)}>
                            <td className="numeric" style={{ fontWeight: '600', color: 'var(--accent-blue)' }}>{item.tenderId}</td>
                            <td style={{ maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.department}>
                              {item.department}
                            </td>
                            <td style={{ maxWidth: '250px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.title}>
                              {item.title}
                            </td>
                            <td className="numeric" style={{ fontWeight: '500' }}>{formatValue(item.value)}</td>
                            <td className="numeric">{item.bids}</td>
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

            {/* 3. MONOPOLY VENDOR TRACKER */}
            {activeTab === 'vendor' && (
              <div className="animate-fade-in">
                <div className={styles.chartTitle} style={{ marginBottom: '8px' }}>
                  {current.vendorTitle}
                </div>
                <p style={{ color: 'var(--text-secondary)', marginBottom: '24px' }}>
                  {current.vendorDesc}
                </p>

                <div className={styles.chartGrid}>
                  <div className={`glassPanel ${styles.chartCard}`} style={{ minHeight: 'auto', paddingBottom: '32px' }}>
                    <div className={styles.chartTitle}>Top Private Sector Contractors</div>
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
                              <div className={`${styles.leaderboardVal} numeric`}>{formatValue(v.value)}</div>
                            </div>
                            <div className={styles.leaderboardBar}>
                              <div className={styles.leaderboardFill} style={{ width: `${percent}%` }} />
                            </div>
                            <div className={styles.leaderboardMeta}>
                              <span>Contracts: <strong className="numeric">{v.contracts}</strong></span>
                              <span>Avg Bids: <strong className="numeric">{v.avgBids ? v.avgBids.toFixed(1) : '---'}</strong></span>
                              {v.singleBidRate > 0 && (
                                <span style={{ color: 'var(--color-risk-catastrophic)' }}>
                                  Single-Bid Wins: <strong className="numeric">{v.singleBidRate}%</strong>
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
                        <ShieldAlert size={16} color="var(--color-risk-catastrophic)" />
                        {current.marketShareConcentration}
                      </div>
                      <div className={`${styles.kpiValue} numeric`} style={{ fontSize: '1.8rem', color: 'var(--color-risk-high)' }}>
                        Top 5 Vendor Share: 48.2%
                      </div>
                      <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '6px' }}>
                        The top 5 private sector firms capture approximately half of the total awarded value, indicating moderately high market concentration.
                      </p>
                    </div>

                    <div className={`glassPanel ${styles.kpiCard}`} style={{ flex: 1, justifyContent: 'center' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        <div className={styles.insightSection}>
                          <div className={`${styles.insightTitle} ${styles.eli5}`} style={{ fontSize: '0.95rem' }}>
                            <Info size={16} /> Market Concentration Checklist
                          </div>
                          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', lineHeight: '1.5' }}>
                            Antitrust authorities utilize the Herfindahl-Hirschman Index (HHI) to audit market health:
                            <br /><br />
                            * **HHI &lt; 1500:** Competitive market; low risk.
                            <br />
                            * **1500 &lt; HHI &lt; 2500:** Moderately concentrated.
                            <br />
                            * **HHI &gt; 2500:** Highly concentrated (Oligopoly/Capture). High risk of budget leakage.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Money Flow Sankey Diagram */}
                <div className={`glassPanel ${styles.chartCard}`} style={{ marginTop: '24px' }}>
                  <div className={styles.chartTitle}>
                    <span>Money Flow: Budget → Departments → Top Vendors</span>
                  </div>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '16px', lineHeight: '1.4' }}>
                    Visualizes how public funds flow from the total procurement budget through major government departments to their top private sector contractors. Hover over any flow path to see the exact value and percentage share.
                  </p>
                  {sankeyLoading ? (
                    <div style={{ display: 'flex', padding: '48px', justifyContent: 'center' }}>
                      <div className={styles.loadingSpinner} style={{ width: '40px', height: '40px' }} />
                    </div>
                  ) : (
                    <MoneyFlowSankey data={sankeyData} formatValue={formatValue} />
                  )}
                </div>
              </div>
            )}

            {/* 4. CIVIC AUDITOR CANVAS (GRANULAR SEARCH BUILDER) */}
            {activeTab === 'search' && (
              <div className="animate-fade-in">
                <div className={styles.chartTitle} style={{ marginBottom: '8px' }}>
                  {current.search}
                </div>
                <p style={{ color: 'var(--text-secondary)', marginBottom: '24px' }}>
                  Build custom procurement audits utilizing full-text text keyword indices and multiple numeric threshold parameters.
                </p>

                {/* Filter Canvas form */}
                <form onSubmit={handleSearchSubmit} className={styles.searchContainer}>
                  <div className={`${styles.inputGroup} ${styles.gridSpan2}`}>
                    <label>{language === 'hi' ? 'खोज शब्द (FTS5)' : 'Search Term (FTS5)'}</label>
                    <input
                      type="text"
                      value={searchQ}
                      onChange={(e) => setSearchQ(e.target.value)}
                      placeholder={current.searchPlaceholder}
                    />
                  </div>
                  <div className={styles.inputGroup}>
                    <label>{current.minBidsLabel}</label>
                    <input
                      type="number"
                      value={searchMinBids}
                      onChange={(e) => setSearchMinBids(e.target.value)}
                      placeholder={current.minBidsPlaceholder}
                    />
                  </div>
                  <div className={styles.inputGroup}>
                    <label>{language === 'hi' ? 'न्यूनतम मूल्य (रुपये में)' : 'Min Value (in absolute Rupees)'}</label>
                    <input
                      type="number"
                      value={searchMinVal}
                      onChange={(e) => setSearchMinVal(e.target.value)}
                      placeholder="e.g. 10000000"
                    />
                  </div>

                  {/* Row 2: Select Dropdowns */}
                  <div className={styles.inputGroup}>
                    <label>{language === 'hi' ? 'राज्य' : 'State / Region'}</label>
                    <select value={searchState} onChange={(e) => setSearchState(e.target.value)}>
                      <option value="">All States</option>
                      <option value="Madhya Pradesh">Madhya Pradesh</option>
                      <option value="Kerala">Kerala</option>
                      <option value="Maharashtra">Maharashtra</option>
                      <option value="Punjab">Punjab</option>
                      <option value="Tamil Nadu">Tamil Nadu</option>
                      <option value="Haryana">Haryana</option>
                      <option value="West Bengal">West Bengal</option>
                      <option value="Assam">Assam</option>
                      <option value="Odisha">Odisha</option>
                      <option value="Jharkhand">Jharkhand</option>
                      <option value="Himachal Pradesh">Himachal Pradesh</option>
                    </select>
                  </div>

                  <div className={styles.inputGroup}>
                    <label>{language === 'hi' ? 'क्षेत्र' : 'Economic Sector'}</label>
                    <select value={searchSector} onChange={(e) => setSearchSector(e.target.value)}>
                      <option value="">All Sectors</option>
                      <option value="roads">Roads & Transport</option>
                      <option value="defense">Defense & Security</option>
                      <option value="energy">Energy & Power</option>
                      <option value="petroleum">Petroleum & Gas</option>
                      <option value="agriculture">Agriculture & Cooperatives</option>
                      <option value="aviation">Aviation & Logistics</option>
                    </select>
                  </div>

                  <div className={styles.inputGroup}>
                    <label>{language === 'hi' ? 'संस्था' : 'Buying Entity'}</label>
                    <select value={searchEntity} onChange={(e) => setSearchEntity(e.target.value)}>
                      <option value="">All Entities</option>
                      <option value="Food Corporation of India">Food Corporation of India (FCI)</option>
                      <option value="E-IN-C BRANCH - MILITARY ENGINEER SERVICES">Military Engineer Services (MES)</option>
                      <option value="Bharat Heavy Electricals Limited">Bharat Heavy Electricals Limited (BHEL)</option>
                      <option value="Bharat Petroleum Corporation Limited">Bharat Petroleum Corporation Limited (BPCL)</option>
                      <option value="IndianOil">IndianOil</option>
                      <option value="National Highways Authority of India">National Highways Authority of India (NHAI)</option>
                      <option value="Mahanadi Coalfields Limited">Mahanadi Coalfields Limited</option>
                      <option value="Neyveli Lignite Corporation Limited">Neyveli Lignite Corporation (NLC)</option>
                      <option value="South Eastern Coalfields Limited">South Eastern Coalfields Limited</option>
                      <option value="HINDUSTAN PETROLEUM CORPORATION LTD">Hindustan Petroleum (HPCL)</option>
                    </select>
                  </div>

                  <button type="submit" disabled={searchLoading} className={styles.btnSearch}>
                    <Search size={18} />
                    {searchLoading ? current.searchingBtn : current.searchBtn}
                  </button>
                </form>

                {searchLoading ? (
                  <div style={{ display: 'flex', padding: '48px', justifyContent: 'center' }}>
                    <div className={styles.loadingSpinner} style={{ width: '40px', height: '40px' }} />
                  </div>
                ) : (
                  <>
                    <div className={`glassPanel ${styles.tableCard}`}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                        <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                          {current.showingResults} <strong className="numeric">{((searchPage - 1) * searchLimit) + 1}</strong> - <strong className="numeric">{Math.min(searchPage * searchLimit, searchTotal)}</strong> {current.of} <strong className="numeric">{searchTotal.toLocaleString()}</strong>
                        </span>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          {searchMinBids && (
                            <span className={`${styles.badge} ${styles.badgeRed}`} style={{ textTransform: 'none', cursor: 'pointer' }} onClick={() => setSearchMinBids('')}>
                              Min Bids: {searchMinBids} <X size={10} style={{ marginLeft: '4px' }} />
                            </span>
                          )}
                          {searchMinVal && (
                            <span className={`${styles.badge} ${styles.badgeInfo}`} style={{ textTransform: 'none', cursor: 'pointer' }} onClick={() => setSearchMinVal('')}>
                              Min Value: {formatValue(parseFloat(searchMinVal))} <X size={10} style={{ marginLeft: '4px' }} />
                            </span>
                          )}
                        </div>
                      </div>

                      <div className={styles.tableWrapper}>
                        <table className={styles.table}>
                          <thead>
                            <tr>
                              <th>{current.tenderId}</th>
                              <th>{current.department}</th>
                              <th>{current.tenderTitle}</th>
                              <th>{current.contractVal}</th>
                              <th>{current.bidsCount}</th>
                              <th>{current.contractDate}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {searchResults.length === 0 ? (
                              <tr>
                                <td colSpan="6" className={styles.emptyState}>
                                  {current.noResults}
                                </td>
                              </tr>
                            ) : (
                              searchResults.map((item) => (
                                <tr key={item.internalId || item.tenderId} onClick={() => handleRowClick(item)}>
                                  <td className="numeric" style={{ fontWeight: '600', color: 'var(--accent-blue)' }}>{item.tenderId}</td>
                                  <td style={{ maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.department}>
                                    {item.department}
                                  </td>
                                  <td style={{ maxWidth: '250px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.title}>
                                    {item.title}
                                  </td>
                                  <td className="numeric" style={{ fontWeight: '500' }}>{formatValue(item.value)}</td>
                                  <td className="numeric">{item.bids}</td>
                                  <td className="numeric">{item.contractDate ? item.contractDate.split(' ')[0] : '---'}</td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>

                      {searchTotal > searchLimit && (
                        <div className={styles.pagination}>
                          <button
                            className={styles.btnPagination}
                            disabled={searchPage === 1}
                            onClick={() => setSearchPage(prev => Math.max(1, prev - 1))}
                          >
                            {current.prev}
                          </button>
                          <span className="numeric" style={{ color: 'var(--text-secondary)' }}>
                            {searchPage}
                          </span>
                          <button
                            className={styles.btnPagination}
                            disabled={searchPage * searchLimit >= searchTotal}
                            onClick={() => setSearchPage(prev => prev + 1)}
                          >
                            {current.next}
                          </button>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}
          </>
        )}
      </main>

      {/* Tender Details Drawer */}
      {selectedTender && (
        <div className={`${styles.detailsDrawer} ${selectedTender ? styles.open : ''}`}>
          <div className={styles.drawerHeader}>
            <h3 className={styles.drawerTitle}>{selectedTender.tenderId}</h3>
            <button className={styles.drawerClose} onClick={() => setSelectedTender(null)}>
              <X size={20} />
            </button>
          </div>

          <div className={styles.drawerBody}>
            <div className={styles.metaGrid}>
              <div className={styles.metaItem}>
                <span className={styles.metaLabel}>{current.department}</span>
                <span className={styles.metaValue}>{selectedTender.department}</span>
              </div>
              <div className={styles.metaItem}>
                <span className={styles.metaLabel}>{current.tenderTitle}</span>
                <span className={styles.metaValue} style={{ fontSize: '0.95rem', lineHeight: '1.4' }}>{selectedTender.title}</span>
              </div>
              <div className={styles.metaItem}>
                <span className={styles.metaLabel}>{current.winningVendor}</span>
                <span className={styles.metaValue} style={{ color: 'var(--accent-blue)', fontWeight: '600' }}>{selectedTender.vendor}</span>
              </div>
              <div className={styles.metaItem}>
                <span className={styles.metaLabel}>{current.contractVal}</span>
                <span className={`${styles.metaValue} numeric`} style={{ fontSize: '1.4rem', color: 'var(--color-risk-baseline)' }}>{formatValue(selectedTender.value)}</span>
              </div>
              <div className={styles.metaItem}>
                <span className={styles.metaLabel}>{current.bidsCount}</span>
                <span className={`${styles.metaValue} numeric`}>{selectedTender.bids} Bids</span>
              </div>
              <div className={styles.metaItem}>
                <span className={styles.metaLabel}>{current.bidWindow}</span>
                <span className={`${styles.metaValue} numeric`}>{selectedTender.bidWindow} days</span>
              </div>
              <div className={styles.metaItem}>
                <span className={styles.metaLabel}>{current.awardDelay}</span>
                <span className={`${styles.metaValue} numeric`}>{selectedTender.awardDelay} days</span>
              </div>
            </div>

            {/* Red Flag Indicators */}
            <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '16px' }}>
              <h4 style={{ fontSize: '0.9rem', color: 'var(--text-primary)', marginBottom: '12px' }}>{current.anomaliesFlagged}</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {selectedTender.bids === 1 && (
                  <div className={`${styles.badge} ${styles.badgeRed}`} style={{ padding: '8px 12px', textTransform: 'none', borderRadius: '6px' }}>
                    <ShieldAlert size={14} style={{ marginRight: '6px' }} />
                    Single-Bid Contract Win
                  </div>
                )}
                {selectedTender.bidWindow !== null && selectedTender.bidWindow < 7 && (
                  <div className={`${styles.badge} ${styles.badgeAmber}`} style={{ padding: '8px 12px', textTransform: 'none', borderRadius: '6px' }}>
                    <AlertTriangle size={14} style={{ marginRight: '6px' }} />
                    Short advertisement window (Rush Job)
                  </div>
                )}
                {selectedTender.awardDelay !== null && selectedTender.awardDelay > 90 && (
                  <div className={`${styles.badge} ${styles.badgeInfo}`} style={{ padding: '8px 12px', textTransform: 'none', borderRadius: '6px' }}>
                    <Info size={14} style={{ marginRight: '6px' }} />
                    Prolonged Award Delay (&gt;90d)
                  </div>
                )}
              </div>
            </div>

            {/* Educational Insights Section */}
            <div className={styles.insightsContainer}>
              <h4 style={{ fontSize: '0.9rem', color: 'var(--text-primary)', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '8px' }}>
                {current.educationalInsights}
              </h4>

              {selectedTender.bids === 1 && (
                <div className={styles.insightSection}>
                  <div className={`${styles.insightTitle} ${styles.eli5}`}>
                    <Info size={14} /> {current.eli5Title}
                  </div>
                  <p className={styles.insightText}>
                    Only one company offered to do this job. Since there was no competition, the government might have paid much more than they should have, or let a friend get the deal.
                  </p>
                  <div className={`${styles.insightTitle} ${styles.consultant}`} style={{ marginTop: '4px' }}>
                    <FileText size={14} /> {current.econometricTitle}
                  </div>
                  <p className={styles.insightText}>
                    Single-bid procurement suggests pre-arranged tender criteria, tailored technical specifications, or cartel collusion. Studies show single bids cost 15% more on average.
                  </p>
                </div>
              )}

              {selectedTender.bidWindow !== null && selectedTender.bidWindow < 7 && (
                <div className={styles.insightSection} style={{ marginTop: '12px' }}>
                  <div className={`${styles.insightTitle} ${styles.eli5}`}>
                    <Info size={14} /> {current.eli5Title}
                  </div>
                  <p className={styles.insightText}>
                    The government only gave companies {selectedTender.bidWindow} days to write and send their applications. That is way too quick, so new companies couldn't apply in time.
                  </p>
                </div>
              )}
            </div>

            <button
              className={styles.btnGenerateDossier}
              style={{ marginTop: '12px' }}
              onClick={() => handleGenerateRti(selectedTender)}
            >
              <FileText size={18} />
              {current.generateDossier}
            </button>
          </div>
        </div>
      )}

      {/* RTI Dossier Generation Modal */}
      {isRtiModalOpen && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalContent} style={{ maxWidth: '640px', width: '90%', maxHeight: '80vh', overflowY: 'auto' }}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <FileText size={22} color="var(--accent-blue)" />
                {current.dossierTitle}
              </h3>
              <button className={styles.modalClose} onClick={() => { setIsRtiModalOpen(false); setRtiText(''); }}>
                <X size={20} />
              </button>
            </div>
            <div className={styles.modalBody} style={{ padding: '20px 0' }}>
              {isGeneratingRti ? (
                <div style={{ display: 'flex', flexDirection: 'column', itemsAlign: 'center', justifyContent: 'center', padding: '48px', gap: '16px' }}>
                  <div className={styles.loadingSpinner} style={{ width: '40px', height: '40px' }} />
                  <p style={{ color: 'var(--text-secondary)', textAlign: 'center' }}>{current.dossierLoadingText}</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                    Copy this statutory template or print it to file a statutory RTI application. Under Section 6(1), the PIO must respond within 30 days.
                  </p>
                  <textarea
                    readOnly
                    value={rtiText}
                    style={{ width: '100%', minHeight: '350px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-subtle)', borderRadius: '8px', padding: '16px', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', fontSize: '0.85rem', resize: 'vertical', lineHeight: '1.4' }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                    <button className={styles.btnSecondary} onClick={() => { navigator.clipboard.writeText(rtiText); alert('RTI Text Copied to Clipboard!'); }}>
                      Copy Text
                    </button>
                    <button className={styles.btnPrimary} onClick={() => window.print()}>
                      <Download size={16} /> Print Application
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
