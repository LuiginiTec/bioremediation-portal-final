import React, { useState, useEffect, useCallback } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';

// --- CONFIGURATION ---
const API_URL = import.meta.env.VITE_API_URL || 'https://bioremediation-portal-final.onrender.com';
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};

// --- OPTIONS & CONSTANTS ---
const BIOMEC_OPTIONS = ['Biosorption', 'Bioaccumulation', 'Bioprecipitation', 'Bioreduction', 'Enzymatic_Degradation', 'Volatilization'];
const HABITAT_OPTIONS = ['A-Aquatic', 'T-Terrestrial', 'I-Industrial', 'O-Other'];
const ASSEMBLY_OPTIONS = ['Complete_Genome', 'Draft_Assembly', 'Plasmid'];

// --- COMPONENTS ---

const Message = ({ message }) => {
  if (!message) return null;
  let bgColor = 'bg-blue-100 border-blue-400 text-blue-700';
  if (message.type === 'success') bgColor = 'bg-green-100 border-green-400 text-green-700';
  else if (message.type === 'error') bgColor = 'bg-red-100 border-red-400 text-red-700';
  return <div className={`p-4 border-l-4 ${bgColor} rounded-lg shadow-lg mb-6 max-w-7xl mx-auto font-medium`}>{message.text}</div>;
};

const InputField = ({ label, name, value, onChange, type = 'text', required = false, step, placeholder, error }) => (
    <div className="mb-4">
      <label htmlFor={name} className="block text-sm font-medium text-gray-700">{label} {required && <span className="text-red-500">*</span>}</label>
      <input type={type} name={name} id={name} value={value} onChange={onChange} required={required} step={step} placeholder={placeholder}
        className={`mt-1 block w-full px-3 py-2 border rounded-lg shadow-sm focus:outline-none sm:text-sm transition duration-200 ${error ? 'border-red-500 bg-red-50' : 'border-gray-300 focus:ring-indigo-500'}`} />
      {error && <p className="mt-1 text-xs text-red-600 font-semibold">{error}</p>}
    </div>
);

const SelectField = ({ label, name, value, onChange, options, required = false }) => (
  <div className="mb-4">
    <label htmlFor={name} className="block text-sm font-medium text-gray-700">{label} {required && <span className="text-red-500">*</span>}</label>
    <select name={name} id={name} value={value} onChange={onChange} required={required}
      className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-indigo-500 sm:text-sm">
      {options.map(opt => <option key={opt} value={opt.split('-')[0]}>{opt}</option>)}
    </select>
  </div>
);

// --- MAIN APP ---

function App() {
  const [userId, setUserId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState(null);
  const [activeTab, setActiveTab] = useState('core');
  const [formErrors, setFormErrors] = useState({});

  // Data State
  const [microbes, setMicrobes] = useState([]);
  const [selectedMicrobeId, setSelectedMicrobeId] = useState(null); // The Workflow Key

  // Forms State
  const [sampleData, setSampleData] = useState({ sample_name: '', latitude: '', longitude: '', habitat_type: 'A' });
  const [microbeData, setMicrobeData] = useState({ strain_name: '', genus: '', species: '', ncbi_taxonomy_id: '' });
  const [expData, setExpData] = useState({ optimal_ph: '', optimal_temp: '', initial_conc_mg_L: '', nutrient_regime: '', publication_doi: '' });
  const [capacityData, setCapacityData] = useState({ time_h: '', removal_efficiency: '', max_uptake_mg_g: '', mechanism: 'Biosorption' });
  const [metalData, setMetalData] = useState({ metal_name: '', symbol: '', valence_state: '', ligand_type: '', atomic_number: '' });
  
  // Tab 2 & 3 State
  const [genomeData, setGenomeData] = useState({ accession_id: '', sequencing_platform: '', assembly_status: 'Complete_Genome', gc_content: '' });
  const [pathwayData, setPathwayData] = useState({ kegg_pathway_id: '', pathway_name: '', metabolic_type: 'Aerobic', notes: '' });

  const showMessage = useCallback((text, type = 'success') => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 5500);
  }, []);

  // 1. Initial Load: Auth + Fetch Microbes
  useEffect(() => {
    const init = async () => {
        if (Object.keys(firebaseConfig).length) {
            const app = initializeApp(firebaseConfig);
            const auth = getAuth(app);
            await signInAnonymously(auth);
            onAuthStateChanged(auth, u => setUserId(u ? u.uid : null));
        }
        await getMicrobeList(); // FETCH LIST ON LOAD
        setLoading(false);
    };
    init();
  }, []);

  const getMicrobeList = async () => {
      try {
          const res = await fetch(`${API_URL}/api/microorganisms`);
          if (res.ok) setMicrobes(await res.json());
      } catch (err) { console.error("Fetch error", err); }
  };

  const validateForm = () => {
    const errors = {};
    const ph = parseFloat(expData.optimal_ph);
    if (expData.optimal_ph && (ph < 0 || ph > 14)) errors.optimal_ph = "pH must be 0-14";
    if (capacityData.removal_efficiency && (parseFloat(capacityData.removal_efficiency) > 100)) errors.removal_efficiency = "Max 100%";
    if (capacityData.time_h && parseInt(capacityData.time_h) < 0) errors.time_h = "Cannot be negative";
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // --- SUBMIT HANDLERS ---

  const handleCoreSubmission = async (e) => {
    e.preventDefault();
    if (!validateForm()) return showMessage("Please fix errors", "error");
    setIsSubmitting(true);
    
    try {
        const payload = { 
            sampleData, microbeData, userId,
            expData: { ...expData, optimal_ph: parseFloat(expData.optimal_ph) },
            capacityData: { ...capacityData, time_h: parseInt(capacityData.time_h) },
            metalData: { ...metalData, atomic_number: parseInt(metalData.atomic_number) }
        };

        const res = await fetch(`${API_URL}/api/core-data`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const result = await res.json();
        if (!res.ok) throw new Error(result.error || result.message);

        showMessage(`Success! ID: ${result.microorganism_id}. You can now add Genomic Data.`, 'success');
        await getMicrobeList(); // Refresh list
        setSelectedMicrobeId(result.microorganism_id); // Auto-select for next workflow step
        
        // Clear forms
        setSampleData({ sample_name: '', latitude: '', longitude: '', habitat_type: 'A' });
        setMicrobeData({ strain_name: '', genus: '', species: '', ncbi_taxonomy_id: '' });
        setExpData({ optimal_ph: '', optimal_temp: '', initial_conc_mg_L: '', nutrient_regime: '', publication_doi: '' });

    } catch (err) { showMessage(`Failed: ${err.message}`, 'error'); } 
    finally { setIsSubmitting(false); }
  };

  const handleGenomeSubmission = async (e) => {
      e.preventDefault();
      setIsSubmitting(true);
      try {
          const res = await fetch(`${API_URL}/api/genome-data`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ microorganism_id: selectedMicrobeId, genomeData })
          });
          if (!res.ok) throw new Error((await res.json()).error);
          showMessage("Genomic Data Linked Successfully!", 'success');
          setGenomeData({ accession_id: '', sequencing_platform: '', assembly_status: 'Complete_Genome', gc_content: '' });
      } catch (err) { showMessage(err.message, 'error'); }
      finally { setIsSubmitting(false); }
  };

  const handleMetabolismSubmission = async (e) => {
      e.preventDefault();
      setIsSubmitting(true);
      try {
          const res = await fetch(`${API_URL}/api/metabolism-data`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ microorganism_id: selectedMicrobeId, pathwayData })
          });
          if (!res.ok) throw new Error((await res.json()).error);
          showMessage("Metabolism Data Linked Successfully!", 'success');
          setPathwayData({ kegg_pathway_id: '', pathway_name: '', metabolic_type: 'Aerobic', notes: '' });
      } catch (err) { showMessage(err.message, 'error'); }
      finally { setIsSubmitting(false); }
  };

  if (loading) return <div className="p-10 text-center text-xl text-indigo-600">Loading Portal...</div>;

  // --- RENDER FORMS ---

  const CoreDataEntry = (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="p-4 bg-white shadow rounded border-t-4 border-blue-500">
            <h3 className="font-bold text-lg mb-3">1. Sample & Microbe</h3>
            <InputField label="Sample Name" name="sample_name" value={sampleData.sample_name} onChange={e => setSampleData({...sampleData, sample_name: e.target.value})} required />
            <SelectField label="Habitat" name="habitat_type" value={sampleData.habitat_type} onChange={e => setSampleData({...sampleData, habitat_type: e.target.value})} options={HABITAT_OPTIONS} />
            <InputField label="Strain Name" name="strain_name" value={microbeData.strain_name} onChange={e => setMicrobeData({...microbeData, strain_name: e.target.value})} required />
            <InputField label="Genus" name="genus" value={microbeData.genus} onChange={e => setMicrobeData({...microbeData, genus: e.target.value})} required />
            <InputField label="NCBI Taxonomy ID" name="ncbi_taxonomy_id" value={microbeData.ncbi_taxonomy_id} onChange={e => setMicrobeData({...microbeData, ncbi_taxonomy_id: e.target.value})} />
        </div>
        <div className="p-4 bg-white shadow rounded border-t-4 border-green-500">
            <h3 className="font-bold text-lg mb-3">2. Experiment & Metal</h3>
            <InputField label="DOI (Required)" name="publication_doi" value={expData.publication_doi} onChange={e => setExpData({...expData, publication_doi: e.target.value})} required />
            <div className="grid grid-cols-2 gap-2">
                <InputField label="pH" name="optimal_ph" value={expData.optimal_ph} onChange={e => setExpData({...expData, optimal_ph: e.target.value})} type="number" step="0.1" error={formErrors.optimal_ph} />
                <InputField label="Temp (°C)" name="optimal_temp" value={expData.optimal_temp} onChange={e => setExpData({...expData, optimal_temp: e.target.value})} type="number" step="0.1" />
            </div>
            <div className="bg-gray-50 p-2 rounded border mb-2">
                <div className="grid grid-cols-2 gap-2">
                    <InputField label="Metal Symbol" name="symbol" value={metalData.symbol} onChange={e => setMetalData({...metalData, symbol: e.target.value})} required />
                    <InputField label="Valence" name="valence_state" value={metalData.valence_state} onChange={e => setMetalData({...metalData, valence_state: e.target.value})} required />
                </div>
                <InputField label="Metal Name" name="metal_name" value={metalData.metal_name} onChange={e => setMetalData({...metalData, metal_name: e.target.value})} required />
            </div>
            <div className="grid grid-cols-2 gap-2">
                <InputField label="Time (h)" name="time_h" value={capacityData.time_h} onChange={e => setCapacityData({...capacityData, time_h: e.target.value})} type="number" error={formErrors.time_h} required />
                <InputField label="Efficiency (%)" name="removal_efficiency" value={capacityData.removal_efficiency} onChange={e => setCapacityData({...capacityData, removal_efficiency: e.target.value})} type="number" error={formErrors.removal_efficiency} />
            </div>
        </div>
        <div className="md:col-span-2">
            <button onClick={handleCoreSubmission} disabled={isSubmitting} className="w-full bg-indigo-600 text-white font-bold py-3 rounded hover:bg-indigo-700 disabled:opacity-50">
                {isSubmitting ? 'Submitting...' : 'Submit Core Data'}
            </button>
        </div>
    </div>
  );

  const GenomeDataEntry = (
    <div className="p-6 bg-white shadow rounded border-t-4 border-red-500 max-w-2xl mx-auto">
        <h3 className="font-bold text-xl mb-4 text-red-700">Genomic Data for Microbe ID: {selectedMicrobeId}</h3>
        <p className="text-sm text-gray-500 mb-4">Linking data to the microbe you just selected or created.</p>
        <InputField label="Accession ID (e.g., GCA_00001)" name="accession_id" value={genomeData.accession_id} onChange={e => setGenomeData({...genomeData, accession_id: e.target.value})} required />
        <InputField label="Sequencing Platform" name="sequencing_platform" value={genomeData.sequencing_platform} onChange={e => setGenomeData({...genomeData, sequencing_platform: e.target.value})} placeholder="Illumina, PacBio..." />
        <SelectField label="Assembly Status" name="assembly_status" value={genomeData.assembly_status} onChange={e => setGenomeData({...genomeData, assembly_status: e.target.value})} options={ASSEMBLY_OPTIONS} />
        <InputField label="GC Content (%)" name="gc_content" value={genomeData.gc_content} onChange={e => setGenomeData({...genomeData, gc_content: e.target.value})} type="number" step="0.1" />
        <button onClick={handleGenomeSubmission} disabled={isSubmitting} className="w-full bg-red-600 text-white font-bold py-3 rounded hover:bg-red-700 mt-4 disabled:opacity-50">
            {isSubmitting ? 'Linking...' : 'Link Genome Data'}
        </button>
    </div>
  );

  const MetabolismDataEntry = (
    <div className="p-6 bg-white shadow rounded border-t-4 border-teal-500 max-w-2xl mx-auto">
        <h3 className="font-bold text-xl mb-4 text-teal-700">Metabolism Data for Microbe ID: {selectedMicrobeId}</h3>
        <InputField label="Pathway Name" name="pathway_name" value={pathwayData.pathway_name} onChange={e => setPathwayData({...pathwayData, pathway_name: e.target.value})} required />
        <InputField label="KEGG Pathway ID" name="kegg_pathway_id" value={pathwayData.kegg_pathway_id} onChange={e => setPathwayData({...pathwayData, kegg_pathway_id: e.target.value})} required placeholder="e.g., map01100" />
        <InputField label="Metabolic Type" name="metabolic_type" value={pathwayData.metabolic_type} onChange={e => setPathwayData({...pathwayData, metabolic_type: e.target.value})} placeholder="Aerobic, Anaerobic..." />
        <InputField label="Notes" name="notes" value={pathwayData.notes} onChange={e => setPathwayData({...pathwayData, notes: e.target.value})} placeholder="Key enzymes involved..." />
        <button onClick={handleMetabolismSubmission} disabled={isSubmitting} className="w-full bg-teal-600 text-white font-bold py-3 rounded hover:bg-teal-700 mt-4 disabled:opacity-50">
            {isSubmitting ? 'Linking...' : 'Link Metabolism Data'}
        </button>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-100 p-4 font-sans">
      <header className="bg-white p-6 rounded shadow mb-6 text-center">
        <h1 className="text-3xl font-extrabold text-indigo-800">Normalized Data Curation Portal</h1>
        <p className="text-sm text-gray-500 mt-1">Status: {loading ? 'Connecting...' : 'Ready'} | User ID: {userId}</p>
      </header>

      <Message message={message} />

      {/* TABS */}
      <div className="flex space-x-2 mb-6 max-w-4xl mx-auto">
        <button onClick={() => setActiveTab('core')} className={`flex-1 py-2 rounded font-bold ${activeTab==='core' ? 'bg-indigo-600 text-white' : 'bg-white text-gray-600'}`}>1. Core Data</button>
        <button onClick={() => setActiveTab('genome')} disabled={!selectedMicrobeId} className={`flex-1 py-2 rounded font-bold ${activeTab==='genome' ? 'bg-red-600 text-white' : 'bg-white text-gray-400 disabled:opacity-50'}`}>2. Genomic Data</button>
        <button onClick={() => setActiveTab('metabolism')} disabled={!selectedMicrobeId} className={`flex-1 py-2 rounded font-bold ${activeTab==='metabolism' ? 'bg-teal-600 text-white' : 'bg-white text-gray-400 disabled:opacity-50'}`}>3. Metabolism Data</button>
      </div>

      <div className="max-w-7xl mx-auto mb-10">
        {activeTab === 'core' && CoreDataEntry}
        {activeTab === 'genome' && GenomeDataEntry}
        {activeTab === 'metabolism' && MetabolismDataEntry}
      </div>

      {/* LIST OF MICROBES (Click to Edit) */}
      <div className="max-w-4xl mx-auto bg-white p-4 rounded shadow">
        <h2 className="font-bold text-gray-700 mb-2">Recent Microorganisms (Click to Add Linked Data)</h2>
        <div className="max-h-60 overflow-y-auto space-y-2">
            {microbes.map(m => (
                <div key={m.id} onClick={() => { setSelectedMicrobeId(m.id); showMessage(`Selected ID: ${m.id}. You can now use Tabs 2 & 3.`, 'info'); }}
                     className={`p-3 border rounded cursor-pointer hover:bg-blue-50 flex justify-between ${selectedMicrobeId === m.id ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500' : 'border-gray-200'}`}>
                    <span className="font-semibold text-indigo-700">{m.strain_name} ({m.genus})</span>
                    <span className="text-sm text-gray-500">ID: {m.id} | {m.habitat_type}</span>
                </div>
            ))}
            {microbes.length === 0 && <p className="text-gray-400 italic">No data yet. Submit your first record above.</p>}
        </div>
      </div>
    </div>
  );
}

export default App;