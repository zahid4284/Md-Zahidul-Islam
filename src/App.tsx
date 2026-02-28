import React, { useState, useEffect, useMemo } from 'react';
import { 
  Thermometer, 
  Zap, 
  Wind, 
  Droplets, 
  Activity, 
  Info, 
  AlertTriangle,
  RefreshCw,
  Cpu,
  Battery as BatteryIcon,
  ChevronRight,
  Sparkles
} from 'lucide-react';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  AreaChart, 
  Area,
  Legend
} from 'recharts';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI } from "@google/genai";
import { cn } from './utils';

// --- Types & Constants ---

type CoolingType = 'Passive Air' | 'Active Air' | 'Liquid Cooling' | 'Immersion';

interface SimulationState {
  ambientTemp: number;
  initialTemp: number;
  cRate: number;
  coolingType: CoolingType;
  duration: number; // minutes
  batteryCapacity: number; // kWh
  internalResistance: number; // mOhms
}

interface DataPoint {
  time: number;
  temp: number;
  heatGen: number;
  heatDiss: number;
  efficiency: number;
}

const COOLING_COEFFICIENTS: Record<CoolingType, number> = {
  'Passive Air': 5,
  'Active Air': 25,
  'Liquid Cooling': 150,
  'Immersion': 450,
};

const THERMAL_MASS = 800; // J/(kg·K) - approximate for Li-ion
const BATTERY_WEIGHT_PER_KWH = 6; // kg/kWh

// --- Components ---

const StatCard = ({ title, value, unit, icon: Icon, color }: { title: string, value: string | number, unit?: string, icon: any, color: string }) => (
  <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-xl">
    <div className="flex items-center gap-3 mb-2">
      <div className={cn("p-2 rounded-lg bg-opacity-10", color.replace('text-', 'bg-'))}>
        <Icon className={cn("w-4 h-4", color)} />
      </div>
      <span className="text-zinc-500 text-xs font-medium uppercase tracking-wider">{title}</span>
    </div>
    <div className="flex items-baseline gap-1">
      <span className="text-2xl font-mono font-bold text-white">{value}</span>
      {unit && <span className="text-zinc-500 text-sm">{unit}</span>}
    </div>
  </div>
);

const InputGroup = ({ label, children }: { label: string, children: React.ReactNode }) => (
  <div className="space-y-2">
    <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block">{label}</label>
    {children}
  </div>
);

export default function App() {
  const [state, setState] = useState<SimulationState>({
    ambientTemp: 25,
    initialTemp: 25,
    cRate: 1.5,
    coolingType: 'Liquid Cooling',
    duration: 60,
    batteryCapacity: 75,
    internalResistance: 20, // mOhms
  });

  const [results, setResults] = useState<DataPoint[]>([]);
  const [isSimulating, setIsSimulating] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const runSimulation = () => {
    setIsSimulating(true);
    const data: DataPoint[] = [];
    let currentTemp = state.initialTemp;
    const timeStep = 1; // 1 minute steps
    const totalWeight = state.batteryCapacity * BATTERY_WEIGHT_PER_KWH;
    const heatCapacity = totalWeight * THERMAL_MASS;
    
    // Resistance in Ohms
    const R = state.internalResistance / 1000;
    // Nominal Voltage (approx 400V for 75kWh)
    const V = 400;
    // Current I = Power / Voltage. Power = Capacity * C-rate
    const I = (state.batteryCapacity * 1000 * state.cRate) / V;

    for (let t = 0; t <= state.duration; t += timeStep) {
      // Heat generated (Watts) = I^2 * R
      const heatGen = Math.pow(I, 2) * R;
      
      // Heat dissipated (Watts) = h * A * (T_batt - T_amb)
      // Surface area A is roughly proportional to capacity. Let's say 0.05 m2 per kWh
      const A = state.batteryCapacity * 0.05;
      const h = COOLING_COEFFICIENTS[state.coolingType];
      const heatDiss = h * A * (currentTemp - state.ambientTemp);
      
      // Net heat (Joules per minute)
      const netHeatJ = (heatGen - heatDiss) * 60;
      
      // Temp change (K) = Q / (m * c)
      const deltaT = netHeatJ / heatCapacity;
      currentTemp += deltaT;

      // Efficiency = (Power_out - Power_loss) / Power_out
      const powerOut = state.batteryCapacity * 1000 * state.cRate;
      const efficiency = ((powerOut - heatGen) / powerOut) * 100;

      data.push({
        time: t,
        temp: Number(currentTemp.toFixed(2)),
        heatGen: Number(heatGen.toFixed(2)),
        heatDiss: Number(heatDiss.toFixed(2)),
        efficiency: Number(efficiency.toFixed(2)),
      });
    }
    
    setResults(data);
    setIsSimulating(false);
  };

  useEffect(() => {
    runSimulation();
  }, [state]);

  const getAIAnalysis = async () => {
    if (isAnalyzing) return;
    setIsAnalyzing(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
      const model = "gemini-3-flash-preview";
      const lastPoint = results[results.length - 1];
      const maxTemp = Math.max(...results.map(d => d.temp));
      
      const prompt = `
        Analyze this EV battery thermal simulation:
        - Battery: ${state.batteryCapacity}kWh, ${state.internalResistance}mΩ resistance
        - Discharge: ${state.cRate}C
        - Cooling: ${state.coolingType}
        - Ambient: ${state.ambientTemp}°C
        - Max Temperature Reached: ${maxTemp.toFixed(1)}°C
        - Final Efficiency: ${lastPoint.efficiency}%
        
        Provide 3 concise professional insights on thermal stability, safety risks, and optimization. 
        Format as a short list. Keep it technical and data-driven.
      `;

      const response = await ai.models.generateContent({
        model,
        contents: prompt,
      });
      setAiAnalysis(response.text || "Analysis unavailable.");
    } catch (error) {
      console.error(error);
      setAiAnalysis("Failed to connect to thermal intelligence engine.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const peakTemp = useMemo(() => Math.max(...results.map(d => d.temp), 0), [results]);
  const avgEfficiency = useMemo(() => (results.reduce((acc, d) => acc + d.efficiency, 0) / results.length).toFixed(2), [results]);

  return (
    <div className="min-h-screen bg-[#050505] text-zinc-300 font-sans selection:bg-emerald-500/30">
      {/* Header */}
      <header className="border-b border-zinc-800 bg-zinc-900/50 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center">
              <Zap className="w-5 h-5 text-black fill-current" />
            </div>
            <div>
              <h1 className="text-white font-bold tracking-tight leading-none">VoltThermal</h1>
              <p className="text-[10px] text-zinc-500 uppercase tracking-[0.2em] font-bold mt-1">Battery Efficiency Lab</p>
            </div>
          </div>
          <div className="flex items-center gap-6">
            <div className="hidden md:flex items-center gap-4 text-xs font-medium text-zinc-500">
              <span className="flex items-center gap-1.5"><Activity className="w-3 h-3" /> Real-time Solver</span>
              <span className="flex items-center gap-1.5"><Cpu className="w-3 h-3" /> v2.4.0-Stable</span>
            </div>
            <button 
              onClick={getAIAnalysis}
              disabled={isAnalyzing}
              className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-black px-4 py-2 rounded-full text-xs font-bold transition-all disabled:opacity-50"
            >
              {isAnalyzing ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
              AI ADVISORY
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Sidebar Controls */}
        <aside className="lg:col-span-3 space-y-6">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-white font-bold text-sm">Simulation Parameters</h2>
              <RefreshCw className={cn("w-4 h-4 text-zinc-600 cursor-pointer hover:text-emerald-500 transition-colors", isSimulating && "animate-spin")} onClick={runSimulation} />
            </div>

            <div className="space-y-4">
              <InputGroup label="Battery Capacity">
                <div className="flex items-center gap-3">
                  <input 
                    type="range" min="20" max="150" step="5"
                    value={state.batteryCapacity}
                    onChange={(e) => setState(s => ({ ...s, batteryCapacity: Number(e.target.value) }))}
                    className="flex-1 accent-emerald-500"
                  />
                  <span className="text-xs font-mono text-white w-12 text-right">{state.batteryCapacity}kWh</span>
                </div>
              </InputGroup>

              <InputGroup label="Discharge Rate (C)">
                <div className="flex items-center gap-3">
                  <input 
                    type="range" min="0.1" max="5" step="0.1"
                    value={state.cRate}
                    onChange={(e) => setState(s => ({ ...s, cRate: Number(e.target.value) }))}
                    className="flex-1 accent-emerald-500"
                  />
                  <span className="text-xs font-mono text-white w-12 text-right">{state.cRate}C</span>
                </div>
              </InputGroup>

              <InputGroup label="Internal Resistance">
                <div className="flex items-center gap-3">
                  <input 
                    type="range" min="5" max="100" step="1"
                    value={state.internalResistance}
                    onChange={(e) => setState(s => ({ ...s, internalResistance: Number(e.target.value) }))}
                    className="flex-1 accent-emerald-500"
                  />
                  <span className="text-xs font-mono text-white w-12 text-right">{state.internalResistance}mΩ</span>
                </div>
              </InputGroup>

              <InputGroup label="Ambient Temperature">
                <div className="flex items-center gap-3">
                  <input 
                    type="range" min="-20" max="50" step="1"
                    value={state.ambientTemp}
                    onChange={(e) => setState(s => ({ ...s, ambientTemp: Number(e.target.value) }))}
                    className="flex-1 accent-emerald-500"
                  />
                  <span className="text-xs font-mono text-white w-12 text-right">{state.ambientTemp}°C</span>
                </div>
              </InputGroup>

              <InputGroup label="Cooling System">
                <div className="grid grid-cols-2 gap-2">
                  {(['Passive Air', 'Active Air', 'Liquid Cooling', 'Immersion'] as CoolingType[]).map((type) => (
                    <button
                      key={type}
                      onClick={() => setState(s => ({ ...s, coolingType: type }))}
                      className={cn(
                        "text-[10px] font-bold py-2 px-1 rounded-lg border transition-all",
                        state.coolingType === type 
                          ? "bg-emerald-500/10 border-emerald-500/50 text-emerald-500" 
                          : "bg-zinc-800/50 border-zinc-700 text-zinc-500 hover:border-zinc-600"
                      )}
                    >
                      {type}
                    </button>
                  ))}
                </div>
              </InputGroup>
            </div>
          </div>

          {/* AI Advisory Box */}
          <AnimatePresence>
            {aiAnalysis && (
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-emerald-500/5 border border-emerald-500/20 rounded-2xl p-5 space-y-3"
              >
                <div className="flex items-center gap-2 text-emerald-500">
                  <Sparkles className="w-4 h-4" />
                  <h3 className="text-xs font-bold uppercase tracking-wider">AI Thermal Insights</h3>
                </div>
                <div className="text-xs text-zinc-400 leading-relaxed prose prose-invert prose-emerald">
                  {aiAnalysis.split('\n').map((line, i) => (
                    <p key={i} className="mb-2">{line}</p>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </aside>

        {/* Main Dashboard Area */}
        <section className="lg:col-span-9 space-y-6">
          
          {/* Stats Grid */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <StatCard 
              title="Peak Temperature" 
              value={peakTemp.toFixed(1)} 
              unit="°C" 
              icon={Thermometer} 
              color={peakTemp > 55 ? "text-red-500" : peakTemp > 45 ? "text-orange-500" : "text-emerald-500"} 
            />
            <StatCard 
              title="Avg Efficiency" 
              value={avgEfficiency} 
              unit="%" 
              icon={Activity} 
              color="text-blue-500" 
            />
            <StatCard 
              title="Heat Generation" 
              value={results[results.length - 1]?.heatGen || 0} 
              unit="W" 
              icon={Zap} 
              color="text-yellow-500" 
            />
            <StatCard 
              title="Cooling Power" 
              value={results[results.length - 1]?.heatDiss || 0} 
              unit="W" 
              icon={Wind} 
              color="text-cyan-500" 
            />
          </div>

          {/* Charts Container */}
          <div className="grid grid-cols-1 gap-6">
            {/* Temperature Curve */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-white font-bold">Thermal Gradient</h3>
                  <p className="text-xs text-zinc-500">Battery core temperature progression over time</p>
                </div>
                <div className="flex items-center gap-4 text-[10px] font-bold uppercase tracking-widest">
                  <span className="flex items-center gap-1.5 text-emerald-500"><div className="w-2 h-2 rounded-full bg-emerald-500" /> Temperature</span>
                  <span className="flex items-center gap-1.5 text-zinc-600"><div className="w-2 h-2 rounded-full bg-zinc-600" /> Ambient</span>
                </div>
              </div>
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={results}>
                    <defs>
                      <linearGradient id="colorTemp" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#18181b" vertical={false} />
                    <XAxis 
                      dataKey="time" 
                      stroke="#52525b" 
                      fontSize={10} 
                      tickLine={false} 
                      axisLine={false}
                      label={{ value: 'Time (min)', position: 'insideBottom', offset: -5, fontSize: 10, fill: '#52525b' }}
                    />
                    <YAxis 
                      stroke="#52525b" 
                      fontSize={10} 
                      tickLine={false} 
                      axisLine={false}
                      domain={['auto', 'auto']}
                    />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: '8px', fontSize: '12px' }}
                      itemStyle={{ color: '#10b981' }}
                    />
                    <Area type="monotone" dataKey="temp" stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#colorTemp)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Heat Balance & Efficiency */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
                <h3 className="text-white font-bold mb-1">Energy Balance</h3>
                <p className="text-xs text-zinc-500 mb-6">Generated Heat vs. Dissipated Heat (Watts)</p>
                <div className="h-[200px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={results}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#18181b" vertical={false} />
                      <XAxis dataKey="time" hide />
                      <YAxis stroke="#52525b" fontSize={10} tickLine={false} axisLine={false} />
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: '8px', fontSize: '12px' }}
                      />
                      <Legend iconType="circle" wrapperStyle={{ fontSize: '10px', paddingTop: '10px' }} />
                      <Line type="monotone" dataKey="heatGen" name="Generated" stroke="#f59e0b" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="heatDiss" name="Dissipated" stroke="#06b6d4" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
                <h3 className="text-white font-bold mb-1">Efficiency Loss</h3>
                <p className="text-xs text-zinc-500 mb-6">System efficiency percentage over simulation</p>
                <div className="h-[200px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={results}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#18181b" vertical={false} />
                      <XAxis dataKey="time" hide />
                      <YAxis stroke="#52525b" fontSize={10} tickLine={false} axisLine={false} domain={[90, 100]} />
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: '8px', fontSize: '12px' }}
                      />
                      <Line type="monotone" dataKey="efficiency" name="Efficiency" stroke="#3b82f6" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </div>

          {/* Safety Warning */}
          {peakTemp > 60 && (
            <div className="bg-red-500/10 border border-red-500/50 rounded-xl p-4 flex items-center gap-4">
              <div className="p-2 bg-red-500 rounded-lg">
                <AlertTriangle className="w-5 h-5 text-black" />
              </div>
              <div>
                <h4 className="text-red-500 font-bold text-sm uppercase tracking-wider">Thermal Runaway Risk Detected</h4>
                <p className="text-xs text-red-500/80">Battery core temperature has exceeded 60°C. Degradation accelerated. Immediate cooling optimization required.</p>
              </div>
            </div>
          )}

          {/* Technical Footer */}
          <div className="flex flex-col md:flex-row items-center justify-between pt-6 border-t border-zinc-800 text-[10px] font-bold text-zinc-600 uppercase tracking-[0.2em]">
            <div className="flex items-center gap-6 mb-4 md:mb-0">
              <span className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> System Online</span>
              <span>Model: ODE-Solver-v4</span>
              <span>Units: SI (Metric)</span>
            </div>
            <div className="flex items-center gap-4">
              <a href="#" className="hover:text-zinc-400 transition-colors">Documentation</a>
              <a href="#" className="hover:text-zinc-400 transition-colors">Export Data (CSV)</a>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
