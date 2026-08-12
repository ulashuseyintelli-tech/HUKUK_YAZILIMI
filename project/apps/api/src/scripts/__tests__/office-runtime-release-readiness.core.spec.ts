import {
  classifyDeltaPath,
  evaluateCapability,
  redactProcessSignature,
  type CapabilityEvidence,
  type DistEvidence,
  type SourceEvidence,
} from '../office-runtime-release-readiness.core';

const matchingSource = (path: string): SourceEvidence => ({
  path,
  canonicalBlob: 'canonical-blob',
  runtimeBlob: 'canonical-blob',
});

const matchingDist = (path: string): DistEvidence => ({
  path,
  exists: true,
  sha256: 'dist-sha256',
  requiredMarkers: ['EXPECTED_MARKER'],
  missingMarkers: [],
});

function evidence(
  sources: SourceEvidence[],
  dist: DistEvidence[],
): CapabilityEvidence {
  return {
    id: 'CAPABILITY',
    sources,
    dist,
    ancestry: [{ commit: 'commit', inRuntimeHead: true }],
    consumer: { state: 'ABSENT', processIds: [], reason: 'NO_RUNTIME_ROOT_API_PROCESS' },
  };
}

describe('office runtime release readiness core', () => {
  it('reports PRESENT_IN_DIST only when every source matches and every dist marker exists', () => {
    expect(
      evaluateCapability(
        evidence([matchingSource('a.ts'), matchingSource('b.ts')], [matchingDist('a.js'), matchingDist('b.js')]),
      ),
    ).toEqual({
      id: 'CAPABILITY',
      status: 'PRESENT_IN_DIST',
      reasons: ['SOURCE_PARITY', 'DIST_MARKERS_PRESENT'],
    });
  });

  it('keeps source parity without dist separate from runtime dist presence', () => {
    const result = evaluateCapability(
      evidence(
        [matchingSource('a.ts')],
        [
          {
            path: 'a.js',
            exists: false,
            sha256: null,
            requiredMarkers: ['EXPECTED_MARKER'],
            missingMarkers: ['EXPECTED_MARKER'],
          },
        ],
      ),
    );

    expect(result.status).toBe('PRESENT_IN_SOURCE');
  });

  it('reports ABSENT when neither source nor dist exists', () => {
    const result = evaluateCapability(
      evidence(
        [{ path: 'a.ts', canonicalBlob: 'canonical-blob', runtimeBlob: null }],
        [{ path: 'a.js', exists: false, sha256: null, requiredMarkers: [], missingMarkers: [] }],
      ),
    );

    expect(result.status).toBe('ABSENT');
  });

  it('fails closed as STALE for partial source or missing dist marker evidence', () => {
    const result = evaluateCapability(
      evidence(
        [matchingSource('a.ts'), { path: 'b.ts', canonicalBlob: 'b', runtimeBlob: null }],
        [matchingDist('a.js'), { ...matchingDist('b.js'), missingMarkers: ['EXPECTED_MARKER'] }],
      ),
    );

    expect(result.status).toBe('STALE');
    expect(result.reasons).toEqual(
      expect.arrayContaining(['RUNTIME_SOURCE_PARTIAL', 'RUNTIME_DIST_MARKER_MISSING']),
    );
  });

  it('fails closed as UNKNOWN when canonical source cannot be read', () => {
    const result = evaluateCapability(
      evidence([{ path: 'a.ts', canonicalBlob: null, runtimeBlob: 'blob' }], [matchingDist('a.js')]),
    );

    expect(result).toEqual({
      id: 'CAPABILITY',
      status: 'UNKNOWN',
      reasons: ['CANONICAL_SOURCE_UNAVAILABLE'],
    });
  });

  it('uses positive program ownership rules and leaves unproven paths UNKNOWN', () => {
    expect(classifyDeltaPath('project/apps/api/src/modules/office/office.service.ts')).toBe(
      'OFFICE',
    );
    expect(classifyDeltaPath('project/apps/api/src/modules/client/client.service.ts')).toBe(
      'CLIENT',
    );
    expect(classifyDeltaPath('project/apps/api/src/modules/auth/auth.service.ts')).toBe('UNKNOWN');
    expect(
      classifyDeltaPath(
        'project/apps/api/prisma/migrations/20260802190000_client_identity_active_partial_unique/migration.sql',
      ),
    ).toBe('CLIENT');
    expect(classifyDeltaPath('project/apps/api/src/modules/case/case.service.ts')).toBe('UNKNOWN');
  });

  it('does not expose process command lines in signatures', () => {
    const secret = ['postgresql://', 'user', ':', 'password', '@example.invalid/db'].join('');
    const signature = redactProcessSignature(
      'node.exe',
      `node dist/apps/api/src/main.js --database=${secret}`,
    );

    expect(signature).toBe('node.exe:api-main');
    expect(signature).not.toContain(secret);
    expect(signature).not.toContain('password');
  });
});
