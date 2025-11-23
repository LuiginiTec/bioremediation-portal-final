import React, { useState, useEffect, useCallback } from 'react';
// We only keep Firebase imports for local user authentication (userId generation)
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, query, setLogLevel, addDoc } from 'firebase/firestore'; 

// --- Configuration Constants ---
// CRITICAL: WHEN YOU DEPLOY YOUR API (TO RENDER/RAILWAY), REPLACE THIS WITH THE PUBLIC RENDER/RAILWAY URL
// Example of a public deployment URL: https://biorem-api-luis.onrender.com
const API_URL = 'https://biorem-api-luis.onrender.com'; 
const API_KEY = ""; // Not used here, but kept for AI helper function 

// --- Global Variables (Provided by Canvas Environment - only used for auth) ---
const appId = typeof __app_id !== 'undefined' ? __app_id : 'biorem_default_id';
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null; 

setLogLevel('debug');

const BIOMEC_OPTIONS = ['Biosorption', 'Bioaccumulation', 'Bioprecipitation', 'Bioreduction', 'Enzymatic_Degradation', 'Volatilization'];
const HABITAT_OPTIONS = ['A-Aquatic', 'T-Terrestrial', 'I-Industrial', 'O-Other'];
const ASSEMBLY_OPTIONS = ['Complete_Genome', 'Draft_Assembly', 'Plasmid']; 


// --- HELPER COMPONENTS ---

// Custom Message Component
const Message = ({ message }) => {
  if (!message) return null;
  
  let bgColor = 'bg-blue-100 border-blue-400 text-blue-700';
  if (message.type === 'success') {
    bgColor = 'bg-green-100 border-green-400 text-green-700';
  } else if (message.type === 'error' || message.type === 'warning') {
    bgColor = 'bg-red-100 border-red-400 text-red-700';
  }

  return (
    <div className={`p-4 border-l-4 ${bgColor} rounded-lg shadow-lg mb-6 max-w-7xl mx-auto`}>
      <p className="font-medium">{message.text}</p>
    </div>
  );
};

// Helper component for input fields
const InputField = ({ label, name, value, onChange, type = 'text', required = false, step, placeholder }) => (
    <div>
      <label htmlFor={name} className="block text-sm font-medium text-gray-700">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <input
        type={type}
        name={name}
        id={name}
        value={value}
        onChange={onChange}
        required={required}
        step={step}
        placeholder={placeholder}
        className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
      />
    </div>
  );

// Helper component for select fields
const SelectField = ({ label, name, value, onChange, options, required = false }) => (
  <div>
    <label htmlFor={name} className="block text-sm font-medium text-gray-700">
      {label} {required && <span className="text-red-500">*</span>}
    </label>
    <select
      name={name}
      id={name}
      value={value}
      onChange={onChange}
      required={required}
      className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
    >
      {options.map(option => (
        <option key={option} value={option.split('-')[0]}>{option}</option>
      ))}
    </select>
  </div>
);

// New Component: AI Research Button
const AiResearchButton = ({ queryText, setter, fieldName, isLoading, setIsLoading, showMessage }) => {
    
    const handleResearch = async () => {
        if (!queryText) {
            showMessage(`Please enter a value in the ${fieldName} field first.`, 'warning');
            return;
        }

        setIsLoading(true);
        showMessage(`Researching "${queryText}"... This may take a moment.`, 'info');
        
        try {
            const result = "AI Functionality is currently disabled when using the local API. Research data manually.";
            
            if (result && result !== "No relevant information found.") {
                setter(result);
                showMessage(`AI research complete for ${fieldName}.`, 'success');
            } else {
                showMessage(`AI found no specific information for "${queryText}". Try a different query.`, 'warning');
            }
            
        } catch (error) {
            showMessage(`AI research failed: ${error.message}`, 'error');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <button
            type="button"
            onClick={handleResearch}
            disabled={isLoading || !queryText}
            className={`w-full text-sm font-medium py-2 px-4 rounded-lg transition duration-200 mt-2 flex items-center justify-center ${
                isLoading ? 'bg-gray-400' : 'bg-pink-500 hover:bg-pink-600 text-white'
            } disabled:opacity-50`}
        >
            {isLoading ? (
                <>
                    <svg className="animate-spin h-4 w-4 mr-2" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                    Researching...
                </>
            ) : (
                <>
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                    AI Research Assistant
                </>
            )}
        </button>
    );
};


// --- MAIN APP COMPONENT ---

function App() {
  const [db, setDb] = useState(null); 
  const [userId, setUserId] = useState(null); 
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAiLoading, setIsAiLoading] = useState(false); 
  const [microbes, setMicrobes] = useState([]); 
  const [message, setMessage] = useState(null); 
  const [activeTab, setActiveTab] = useState('core'); 

  // Form State for Core Data
  const [sampleData, setSampleData] = useState({ sample_name: '', latitude: '', longitude: '', habitat_type: HABITAT_OPTIONS[0].split('-')[0] });
  const [microbeData, setMicrobeData] = useState({ strain_name: '', genus: '', species: '', ncbi_taxonomy_id: '' });
  const [expData, setExpData] = useState({ optimal_ph: '', optimal_temp: '', initial_conc_mg_L: '', nutrient_regime: '', publication_doi: '' });
  const [capacityData, setCapacityData] = useState({ time_h: '', removal_efficiency: '', max_uptake_mg_g: '', mechanism: BIOMEC_OPTIONS[0] });
  
  // NEW STATE for user-defined metal properties
  const [metalData, setMetalData] = useState({
    metal_name: '',
    symbol: '',
    valence_state: '',
    ligand_type: '',
    atomic_number: '',
    pubchem_compound_id: '',
  });


  // Genome/Gene State (omitted for brevity)
  const [selectedMicrobeId, setSelectedMicrobeId] = useState('');
  const [genomeData, setGenomeData] = useState({ accession_id: '', sequencing_platform: '', assembly_status: ASSEMBLY_OPTIONS[0], gc_content: '' });
  const [geneList, setGeneList] = useState([
    { gene_name: '', gene_function: '', kegg_gene_id: '', sequence_dna: '' }
  ]);

  // Metabolism State (omitted for brevity)
  const [pathwayList, setPathwayList] = useState([
    { kegg_pathway_id: '', pathway_name: '', metabolic_type: 'Aerobic', notes: '' }
  ]);


  const showMessage = useCallback((text, type = 'success', duration = 5500) => {
    setMessage({ text, type });
    const timer = setTimeout(() => setMessage(null), duration);
    return () => clearTimeout(timer);
  }, []);

  // --- FIREBASE AUTHENTICATION (REMAINS FOR USER ID) ---
  useEffect(() => {
    try {
      if (!Object.keys(firebaseConfig).length) { setLoading(false); return; }
      const app = initializeApp(firebaseConfig);
      const firebaseAuth = getAuth(app);
      
      const authenticate = async () => {
        try {
          if (initialAuthToken) { await signInWithCustomToken(firebaseAuth, initialAuthToken); } 
          else { await signInAnonymously(firebaseAuth); }
        } catch (error) { console.error("Firebase authentication failed:", error); }
      };
      authenticate();

      const unsubscribe = onAuthStateChanged(firebaseAuth, (user) => {
        if (user) { setUserId(user.uid); } 
        else { setUserId(null); }
        setLoading(false);
      });
      return () => unsubscribe();
    } catch (error) { console.error("Error during Firebase initialization:", error); setLoading(false); }
  }, [initialAuthToken, firebaseConfig]);


  // Placeholder function for listing microbes (Will be replaced by API GET)
  const getMicrobeList = useCallback(() => {
      // In a deployment version, this would be: fetch(`${API_URL}/api/microorganisms`).then(res => res.json()).then(setMicrobes);
      setMicrobes([]); // Keep the list empty until the API GET endpoint is built
  }, []);

  useEffect(() => {
      getMicrobeList();
  }, [getMicrobeList]);
  

  // Function to reset all core forms for next entry
  const resetCoreForms = () => {
    setSampleData({ sample_name: '', latitude: '', longitude: '', habitat_type: HABITAT_OPTIONS[0].split('-')[0] });
    setMicrobeData(prev => ({ 
        strain_name: '', genus: '', species: '', ncbi_taxonomy_id: '',
    }));
    setExpData({ optimal_ph: '', optimal_temp: '', initial_conc_mg_L: '', nutrient_regime: '', publication_doi: '' });
    setCapacityData({ time_h: '', removal_efficiency: '', max_uptake_mg_g: '', mechanism: BIOMEC_OPTIONS[0] });
    setMetalData({ metal_name: '', symbol: '', valence_state: '', ligand_type: '', atomic_number: '', pubchem_compound_id: '' });
  };


  // --- CORE (4-PART) SUBMISSION HANDLER (Sends to PostgreSQL API) ---
  const handleFullSubmission = async (e) => {
    e.preventDefault();
    
    // 1. Frontend Validation
    if (!sampleData.sample_name || !microbeData.strain_name || !microbeData.genus || !expData.publication_doi || !capacityData.time_h) {
        showMessage("Validation failed: Please fill in all required fields.", 'warning'); return;
    }
    if (!metalData.symbol || !metalData.valence_state || !metalData.metal_name) {
        showMessage("Validation failed: Heavy Metal Symbol, Valence State, and Name are required.", 'warning'); return;
    }

    setIsSubmitting(true);
    try {
        // 2. Construct Payload
        const payload = {
            sampleData: { ...sampleData, latitude: parseFloat(sampleData.latitude) || null, longitude: parseFloat(sampleData.longitude) || null, },
            microbeData,
            expData: {
                ...expData,
                optimal_ph: parseFloat(expData.optimal_ph) || null,
                optimal_temp: parseFloat(expData.optimal_temp) || null, 
                initial_conc_mg_L: parseFloat(expData.initial_conc_mg_L) || null,
            },
            capacityData: {
                ...capacityData,
                time_h: parseInt(capacityData.time_h), 
                removal_efficiency: parseFloat(capacityData.removal_efficiency) || null,
                max_uptake_mg_g: parseFloat(capacityData.max_uptake_mg_g) || null,
            },
            metalData: {
                ...metalData,
                atomic_number: parseInt(metalData.atomic_number) || null,
            }, 
            userId: userId, 
        };

        // 3. Send to API (This is the critical call to the Render/Railway backend)
        const response = await fetch(`${API_URL}/api/core-data`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });

        const result = await response.json();

        if (response.ok) {
            showMessage(`Success! Data saved to PostgreSQL. New Microorganism ID: ${result.microorganism_id}`, 'success');
            
            // 1. Update Microbes list (temp fix for enabling other tabs)
            const newMicrobeEntry = { id: result.microorganism_id, ...microbeData };
            setMicrobes(prev => {
                if (!prev.find(m => m.id === newMicrobeEntry.id)) {
                    return [...prev, newMicrobeEntry];
                }
                return prev;
            });
            
            // 2. Set the newly created microbe as selected for Genome/Metabolism tabs
            setSelectedMicrobeId(result.microorganism_id); 
            
            // 3. Reset the form for the next submission
            resetCoreForms();

        } else {
            throw new Error(result.error || response.statusText || result.message);
        }

    } catch (error) {
        console.error("Error during API submission:", error);
        showMessage(`Submission failed: ${error.message}. Is the API server running?`, 'error', 10000);
    } finally {
        setIsSubmitting(false);
    }
  };


  // --- REMAINING HANDLERS (PLACEHOLDERS) ---
  const handleGeneChange = (index, name, value) => { const newGeneList = [...geneList]; newGeneList[index][name] = value; setGeneList(newGeneList); };
  const addGeneField = () => { setGeneList([...geneList, { gene_name: '', gene_function: '', kegg_gene_id: '', sequence_dna: '' }]); };
  const removeGeneField = (index) => { const newGeneList = geneList.filter((_, i) => i !== index); setGeneList(newGeneList); };
  const handleGenomeSubmission = async (e) => { e.preventDefault(); showMessage("Genomic Submission API endpoint not yet implemented.", 'warning'); };
  const handleMetabolismSubmission = async (e) => { e.preventDefault(); showMessage("Metabolism Submission API endpoint not yet implemented.", 'warning'); };
  const handleMicrobeDeletion = async (microbeId, strainName) => { showMessage(`Deletion of ${strainName} not implemented via API yet.`, 'warning'); };


  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-xl font-semibold text-indigo-600">Initializing Portal...</div>
      </div>
    );
  }
  
  // --- RENDERING CORE DATA ENTRY ---
  const CoreDataEntry = (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* 1. ENVIRONMENTAL SAMPLE */}
        <div className="p-5 bg-white shadow-lg rounded-xl border-t-4 border-yellow-500">
          <h2 className="text-xl font-bold text-yellow-700 mb-4 flex items-center">1. Environmental Sample</h2>
          <div className="space-y-3">
            <InputField label="Sample Name" name="sample_name" value={sampleData.sample_name} onChange={(e) => setSampleData({...sampleData, sample_name: e.target.value})} required />
            <InputField label="Latitude" name="latitude" value={sampleData.latitude} onChange={(e) => setSampleData({...sampleData, latitude: e.target.value})} type="number" step="0.00001" placeholder="e.g., 34.05" />
            <InputField label="Longitude" name="longitude" value={sampleData.longitude} onChange={(e) => setSampleData({...sampleData, longitude: e.target.value})} type="number" step="0.00001" placeholder="e.g., -118.24" />
            <SelectField label="Habitat Type (A, T, I, O)" name="habitat_type" value={sampleData.habitat_type} onChange={(e) => setSampleData({...sampleData, habitat_type: e.target.value})} options={HABITAT_OPTIONS} />
          </div>
        </div>

        {/* 2. MICROORGANISM */}
        <div className="p-5 bg-white shadow-lg rounded-xl border-t-4 border-blue-500">
          <h2 className="text-xl font-bold text-blue-700 mb-4 flex items-center">2. Microorganism</h2>
          <div className="space-y-3">
            <InputField label="Strain Name" name="strain_name" value={microbeData.strain_name} onChange={(e) => setMicrobeData({...microbeData, strain_name: e.target.value})} required />
            <InputField label="Genus" name="genus" value={microbeData.genus} onChange={(e) => setMicrobeData({...microbeData, genus: e.target.value})} required />
            <InputField label="Species (Optional)" name="species" value={microbeData.species} onChange={(e) => setMicrobeData({...microbeData, species: e.target.value})} />
            <InputField label="NCBI Taxonomy ID" name="ncbi_taxonomy_id" value={microbeData.ncbi_taxonomy_id} onChange={(e) => setMicrobeData({...microbeData, ncbi_taxonomy_id: e.target.value})} />
          </div>
        </div>

        {/* 3. EXPERIMENT SETUP */}
        <div className="p-5 bg-white shadow-lg rounded-xl border-t-4 border-green-500">
          <h2 className="text-xl font-bold text-green-700 mb-4 flex items-center">3. Experiment Setup</h2>
          <div className="space-y-3">
            <InputField label="Optimal pH" name="optimal_ph" value={expData.optimal_ph} onChange={(e) => setExpData({...expData, optimal_ph: e.target.value})} type="number" step="0.1" />
            <InputField label="Optimal Temp (°C)" name="optimal_temp" value={expData.optimal_temp} onChange={(e) => setExpData({...expData, optimal_temp: e.target.value})} type="number" step="0.1" />
            <InputField label="Initial Conc (mg/L)" name="initial_conc_mg_L" value={expData.initial_conc_mg_L} onChange={(e) => setExpData({...expData, initial_conc_mg_L: e.target.value})} type="number" step="0.1" />
            <InputField label="Nutrient Regime" name="nutrient_regime" value={expData.nutrient_regime} onChange={(e) => setExpData({...expData, nutrient_regime: e.target.value})} placeholder="e.g., Anaerobic, minimal medium" />
            <InputField label="Publication DOI (Required)" name="publication_doi" value={expData.publication_doi} onChange={(e) => setExpData({...expData, publication_doi: e.target.value})} required placeholder="10.1016/j.biortech.2023.129671" />
          </div>
        </div>
        
        {/* 4. REMEDIATION CAPACITY (NOW DYNAMIC INPUT FOR METAL) */}
        <div className="p-5 bg-white shadow-lg rounded-xl border-t-4 border-purple-500">
          <h2 className="text-xl font-bold text-purple-700 mb-4 flex items-center">4. Remediation Results & Metal</h2>
          <div className="space-y-3">
            {/* NEW DYNAMIC METAL INPUT */}
            <div className="bg-gray-50 p-3 rounded-lg border">
                <p className="font-semibold text-sm mb-2 text-gray-700">Define Heavy Metal (Required)</p>
                <div className="grid grid-cols-2 gap-2">
                    <InputField label="Symbol" name="symbol" value={metalData.symbol} onChange={(e) => setMetalData({...metalData, symbol: e.target.value})} required placeholder="e.g., Cr" />
                    <InputField label="Valence State" name="valence_state" value={metalData.valence_state} onChange={(e) => setMetalData({...metalData, valence_state: e.target.value})} required placeholder="e.g., VI" />
                    <div className="col-span-2">
                      <InputField label="Full Name" name="metal_name" value={metalData.metal_name} onChange={(e) => setMetalData({...metalData, metal_name: e.target.value})} required placeholder="e.g., Chromium" />
                    </div>
                </div>
            </div>

            <InputField label="Time (h)" name="time_h" value={capacityData.time_h} onChange={(e) => setCapacityData({...capacityData, time_h: e.target.value})} type="number" step="1" required />
            <InputField label="Removal Efficiency (%)" name="removal_efficiency" value={capacityData.removal_efficiency} onChange={(e) => setCapacityData({...capacityData, removal_efficiency: e.target.value})} type="number" step="0.1" />
            <InputField label="Max Uptake (mg/g)" name="max_uptake_mg_g" value={capacityData.max_uptake_mg_g} onChange={(e) => setCapacityData({...capacityData, max_uptake_mg_g: e.target.value})} type="number" step="0.1" />
            <SelectField label="Mechanism" name="mechanism" value={capacityData.mechanism} onChange={(e) => setCapacityData({...capacityData, mechanism: e.target.value})} options={BIOMEC_OPTIONS} />
          </div>
        </div>
      </div>

      {/* SUBMIT BUTTON for CORE DATA */}
      <div className="lg:col-span-4 max-w-2xl mx-auto w-full mt-4">
        <button
          onClick={handleFullSubmission}
          disabled={isSubmitting || !sampleData.sample_name || !microbeData.strain_name || !microbeData.genus || !expData.publication_doi || !capacityData.time_h || !metalData.symbol || !metalData.valence_state || !metalData.metal_name}
          className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 px-4 rounded-lg text-lg transition duration-200 disabled:opacity-50 flex items-center justify-center"
        >
          {isSubmitting ? (
            <><svg className="animate-spin h-5 w-5 mr-3 text-white" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>Submitting 4 Linked Records...</>
          ) : 'Submit Full Normalized Record (via PostgreSQL API)'}
        </button>
      </div>
    </>
  );

  // Omitted rendering functions for Genome and Metabolism tabs for brevity
  const GenomeDataEntry = ( <div className="p-8 text-center text-xl text-red-700">Genomic Data Entry (API integration pending)</div> );
  const MetabolismDataEntry = ( <div className="p-8 text-center text-xl text-teal-700">Metabolism Data Entry (API integration pending)</div> );
  
  // Omitted other helper functions for brevity

  return (
    <div className="min-h-screen bg-gray-100 p-4 sm:p-8 font-sans">
      <header className="text-center mb-8 bg-white p-6 rounded-xl shadow-md">
        <h1 className="text-3xl font-extrabold text-indigo-800">
          Normalized Data Curation Portal
        </h1>
        <p className="text-sm text-gray-600 mt-2">
          User ID: <span className="font-mono p-1 bg-gray-200 rounded">{userId}</span>
        </p>
        <p className="text-xs text-gray-500 mt-1">
          Frontend (React) runs on port 5173. Backend (API) runs on port 3001.
        </p>
      </header>

      {/* Message Component Display */}
      <Message message={message} /> 

      {/* --- TAB NAVIGATION --- */}
      <div className="max-w-7xl mx-auto mb-6 flex space-x-2 p-1 bg-white rounded-lg shadow-inner">
        <button
          onClick={() => setActiveTab('core')}
          className={`w-1/3 py-2 px-4 rounded-md font-semibold transition duration-200 ${
            activeTab === 'core' ? 'bg-indigo-600 text-white shadow-md' : 'text-gray-700 hover:bg-indigo-50'
          }`}
        >
          Core Data Entry
        </button>
        <button
          onClick={() => setActiveTab('genome')}
          disabled={microbes.length === 0}
          className={`w-1/3 py-2 px-4 rounded-md font-semibold transition duration-200 ${
            activeTab === 'genome' ? 'bg-red-600 text-white shadow-md' : 'text-gray-700 hover:bg-red-50 disabled:opacity-50'
          }`}
        >
          Genomic Data
        </button>
        <button
          onClick={() => setActiveTab('metabolism')}
          disabled={microbes.length === 0}
          className={`w-1/3 py-2 px-4 rounded-md font-semibold transition duration-200 ${
            activeTab === 'metabolism' ? 'bg-teal-600 text-white shadow-md' : 'text-gray-700 hover:bg-teal-50 disabled:opacity-50'
          }`}
        >
          Metabolism Data
        </button>
      </div>

      {/* --- RENDER ACTIVE TAB CONTENT --- */}
      <div className="max-w-7xl mx-auto">
        {activeTab === 'core' && CoreDataEntry}
        {activeTab === 'genome' && GenomeDataEntry}
        {activeTab === 'metabolism' && MetabolismDataEntry}
      </div>


      {/* --- DATA DISPLAY (Simple List for Confirmation) --- */}
      <div className="max-w-7xl mx-auto mt-8 p-4 bg-white shadow-xl rounded-xl">
        <h2 className="text-2xl font-bold text-gray-800 mb-4">Current Microorganisms ({microbes.length})</h2>
        <div className="space-y-2 max-h-60 overflow-y-auto">
          {microbes.map((microbe) => (
            <div key={microbe.id} className="p-3 bg-gray-50 border border-gray-200 rounded-lg text-sm flex justify-between items-center">
              <div>
                <span className="font-semibold text-indigo-600">{microbe.strain_name}</span> ({microbe.genus}) - ID: {microbe.id || 'N/A'}
              </div>
              <button 
                onClick={() => handleMicrobeDeletion(microbe.id, microbe.strain_name)}
                className="text-red-500 hover:text-red-700 font-semibold text-xs py-1 px-2 rounded-lg transition duration-150"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 inline-block mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                Delete All
              </button>
            </div>
          ))}
          {microbes.length === 0 && <p className="text-center text-gray-500 p-4">Start by submitting your first record above!</p>}
        </div>
      </div>
    </div>
  );
}

export default App;