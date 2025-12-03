import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { logger } from '../utils/logger.js';

export interface FieldMapping {
  apiName: string;
  label: string;
  type?: string;
  format?: string;
}

export interface Section {
  name: string;
  fields: FieldMapping[];
}

// Config as stored in JSON files (sections optional when using inheritance)
export interface FieldMappingConfig {
  extends?: string;  // Name of parent config to inherit from (e.g., "default")
  schoolId?: string;
  programId?: string;
  schoolName?: string;
  programName?: string;
  sections?: Section[];
  addSections?: Section[];  // Additional sections to add after inherited ones
  removeSections?: string[];  // Section names to remove from inherited config
  overrideSections?: Section[];  // Sections to override (replace) from inherited config
}

// Resolved config after inheritance is applied (sections required)
export interface ResolvedFieldMappingConfig {
  schoolId?: string;
  programId?: string;
  schoolName?: string;
  programName?: string;
  sections: Section[];
}

const MAPPINGS_DIR = join(process.cwd(), 'config', 'field-mappings');

interface RawConfig extends FieldMappingConfig {
  _filename?: string;
}

export class FieldMappingService {
  private mappings: Map<string, ResolvedFieldMappingConfig> = new Map();
  private rawConfigs: Map<string, RawConfig> = new Map();

  constructor() {
    this.loadMappings();
  }

  private loadMappings(): void {
    try {
      const files = readdirSync(MAPPINGS_DIR).filter((f: string) => f.endsWith('.json'));
      
      // Phase 1: Load all raw configs
      for (const file of files) {
        const content = readFileSync(join(MAPPINGS_DIR, file), 'utf-8');
        const config: RawConfig = JSON.parse(content);
        config._filename = file;
        
        // Store by filename (without .json) for inheritance lookup
        const configName = file.replace('.json', '');
        this.rawConfigs.set(configName, config);
      }
      
      // Phase 2: Resolve inheritance and register configs
      for (const [configName, rawConfig] of this.rawConfigs) {
        const resolvedConfig = this.resolveInheritance(rawConfig);
        this.registerConfig(configName, resolvedConfig);
        logger.info('Loaded field mapping', { 
          file: rawConfig._filename, 
          programName: resolvedConfig.programName, 
          schoolName: resolvedConfig.schoolName,
          extends: rawConfig.extends || 'none'
        });
      }
    } catch (error) {
      logger.warn('Failed to load field mappings', { error, mappingsDir: MAPPINGS_DIR });
    }
  }

  private resolveInheritance(config: RawConfig): ResolvedFieldMappingConfig {
    // If no extends, return config with sections as-is
    if (!config.extends) {
      return {
        schoolId: config.schoolId,
        programId: config.programId,
        schoolName: config.schoolName,
        programName: config.programName,
        sections: config.sections || [],
      };
    }

    // Get parent config
    const parentRaw = this.rawConfigs.get(config.extends);
    if (!parentRaw) {
      logger.warn(`Parent config "${config.extends}" not found for inheritance`);
      return {
        schoolId: config.schoolId,
        programId: config.programId,
        schoolName: config.schoolName,
        programName: config.programName,
        sections: config.sections || [],
      };
    }

    // Recursively resolve parent's inheritance first
    const parent = this.resolveInheritance(parentRaw);

    // Start with parent's sections
    let sections = [...parent.sections];

    // Remove specified sections
    if (config.removeSections && config.removeSections.length > 0) {
      sections = sections.filter(s => !config.removeSections!.includes(s.name));
    }

    // Override specified sections
    if (config.overrideSections && config.overrideSections.length > 0) {
      for (const override of config.overrideSections) {
        const idx = sections.findIndex(s => s.name === override.name);
        if (idx >= 0) {
          sections[idx] = override;
        } else {
          // If section doesn't exist, add it
          sections.push(override);
        }
      }
    }

    // Add additional sections
    if (config.addSections && config.addSections.length > 0) {
      sections = [...sections, ...config.addSections];
    }

    // If child has its own sections array, it completely replaces inherited sections
    if (config.sections && config.sections.length > 0) {
      sections = config.sections;
    }

    return {
      schoolId: config.schoolId ?? parent.schoolId,
      programId: config.programId ?? parent.programId,
      schoolName: config.schoolName ?? parent.schoolName,
      programName: config.programName ?? parent.programName,
      sections,
    };
  }

  private registerConfig(configName: string, config: ResolvedFieldMappingConfig): void {
    // Store by multiple keys for flexible lookup
    // 1. By schoolId/programId (if provided)
    if (config.schoolId || config.programId) {
      const key = this.getMappingKey(config.schoolId, config.programId);
      this.mappings.set(key, config);
    }
    
    // 2. By program name (for program-specific mappings like IllinoisCOM)
    if (config.programName) {
      const programKey = `program:${config.programName}`;
      this.mappings.set(programKey, config);
    }
    
    // 3. By school name (for school-specific mappings)
    if (config.schoolName) {
      const schoolNameKey = `schoolName:${config.schoolName}`;
      this.mappings.set(schoolNameKey, config);
    }
    
    // 4. Default key
    if (configName === 'default') {
      this.mappings.set('default', config);
    }
  }

  private getMappingKey(schoolId?: string, programId?: string): string {
    if (schoolId && programId) {
      return `${schoolId}:${programId}`;
    }
    if (schoolId) {
      return `school:${schoolId}`;
    }
    if (programId) {
      return `program:${programId}`;
    }
    return 'default';
  }

  getMapping(
    schoolId?: string, 
    programId?: string, 
    schoolName?: string, 
    programName?: string
  ): ResolvedFieldMappingConfig | null {
    // Priority 1: Try specific schoolId/programId mapping
    const key = this.getMappingKey(schoolId, programId);
    if (this.mappings.has(key)) {
      return this.mappings.get(key)!;
    }
    
    // Priority 2: Try school-level mapping by ID
    if (schoolId) {
      const schoolKey = `school:${schoolId}`;
      if (this.mappings.has(schoolKey)) {
        return this.mappings.get(schoolKey)!;
      }
    }
    
    // Priority 3: Try school-level mapping by name (check school name BEFORE program name)
    // This ensures KHSU + "Doctor of Osteopathic Medicine" maps to KHSU, not IllinoisCOM
    if (schoolName) {
      const schoolNameKey = `schoolName:${schoolName}`;
      if (this.mappings.has(schoolNameKey)) {
        logger.info('Found mapping by school name', { schoolName, key: schoolNameKey });
        return this.mappings.get(schoolNameKey)!;
      }
    }
    
    // Priority 4: Try by program name (for cases like IllinoisCOM when school name doesn't match)
    // Only check program name if school name didn't match (to avoid conflicts)
    if (programName && !schoolName) {
      const programKey = `program:${programName}`;
      if (this.mappings.has(programKey)) {
        logger.info('Found mapping by program name', { programName, key: programKey });
        return this.mappings.get(programKey)!;
      }
    }
    
    // Priority 5: Fall back to default
    if (this.mappings.has('default')) {
      return this.mappings.get('default')!;
    }
    
    // Priority 6: Hardcoded fallback when no config files loaded (e.g., Lambda deployment issue)
    logger.warn('Using hardcoded fallback config - no mappings loaded from files');
    return this.getHardcodedFallback();
  }

  private getHardcodedFallback(): ResolvedFieldMappingConfig {
    return {
      sections: [
        {
          name: 'Application Information',
          fields: [
            { apiName: 'Name', label: 'Application Number' },
            { apiName: 'Id', label: 'Application ID' },
            { apiName: 'Status', label: 'Application Status' },
            { apiName: 'School_Name__c', label: 'School Name' },
            { apiName: 'Program_Name__c', label: 'Program Name' },
            { apiName: 'Location__c', label: 'Campus Location' },
            { apiName: 'Term__c', label: 'Term' },
            { apiName: 'AppliedDate', label: 'Applied Date', format: 'date' },
            { apiName: 'Application_Submitted_Date__c', label: 'Application Submitted Date', format: 'date' },
            { apiName: 'Admissions_Status__c', label: 'Admissions Status' },
            { apiName: 'Decision__c', label: 'Decision' },
          ]
        },
        {
          name: 'Applicant Information',
          fields: [
            { apiName: 'Contact.FirstName', label: 'First Name' },
            { apiName: 'Contact.LastName', label: 'Last Name' },
            { apiName: 'Contact.Email', label: 'Email' },
            { apiName: 'Contact.MobilePhone', label: 'Mobile', format: 'phone' },
          ]
        }
      ]
    };
  }

  getAllFields(config: ResolvedFieldMappingConfig): string[] {
    return config.sections.flatMap(section => 
      section.fields.map(field => field.apiName)
    );
  }
}

export const fieldMappingService = new FieldMappingService();

