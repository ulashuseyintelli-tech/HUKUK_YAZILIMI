import { Recipe } from '../../types/recipe.types';

/**
 * PREPARE VEHICLE SEIZURE
 * 
 * Araç haczi talebi hazırlar.
 * İnsan onayı gerektirir.
 */
export const PREPARE_VEHICLE_SEIZURE: Recipe = {
  recipeId: 'PrepareVehicleSeizure',
  version: 1,
  name: 'Araç Haczi Talebi Hazırla',
  description: 'Araç haczi talebini hazırlar',
  
  stageTags: ['HACIZ'],
  
  trigger: {
    type: 'event',
    when: [
      'event:VEHICLE_QUERY_COMPLETED',
      'event:VEHICLE_SEIZURE_MANUAL',
    ],
  },
  
  preconditions: [
    { field: 'case.isFinalized', operator: 'eq', value: true },
    { field: 'debtor.hasVehicle', operator: 'eq', value: true },
  ],
  
  read: {
    source: 'database',
    table: 'DebtorAsset',
    fields: [
      { name: 'plaka', type: 'text' },
      { name: 'marka', type: 'text' },
      { name: 'model', type: 'text' },
      { name: 'modelYili', type: 'number' },
      { name: 'tedbirVar', type: 'boolean' },
    ],
  },
  
  decisions: [
    {
      // Tedbir yok → Haciz talebi hazırla
      if: 'tedbirVar == false',
      thenUpdate: {
        vehicleSeizureReady: true,
      },
    },
    {
      // Tedbir var → Uyarı
      if: 'tedbirVar == true',
      thenAction: 'CREATE_WARNING',
      thenUpdate: {
        warningType: 'VEHICLE_HAS_RESTRICTION',
        vehicleSeizureReady: false,
      },
    },
  ],
  
  actions: [],
  
  postconditions: [
    'case.events += VEHICLE_SEIZURE_PREPARED',
  ],
  
  proof: {
    store: ['plaka', 'marka', 'model', 'preparedAt'],
  },
  
  audit: {
    level: 'critical',
    retainDays: 3650,
  },
  
  requiresApproval: true,
  
  priority: 'HIGH',
  isActive: true,
};
