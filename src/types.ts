export interface BatterySpecs {
  capacityKWh: number;
  voltageNominal: number;
  internalResistance: number; // Ohms per cell or pack? Let's say pack for simplicity
  chemistry: 'LFP' | 'NMC' | 'NCA';
}

export interface SimulationInputs {
  ambientTemp: number; // Celsius
  targetTemp: number; // Celsius
  dischargeRate: number; // C-rate
  coolingType: 'Passive Air' | 'Active Air' | 'Liquid Cooling' | 'Immersion';
  durationMinutes: number;
}

export interface SimulationResult {
  timestamp: number;
  batteryTemp: number;
  heatGenerated: number; // Watts
  coolingPower: number; // Watts
  efficiency: number; // Percentage
  soc: number; // State of Charge
}
