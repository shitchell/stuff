#!/usr/bin/env node
/**
 * generate-diagrams.mjs — Parse JS files under docs/ and produce deterministic
 * Mermaid diagrams for module dependencies and class hierarchy.
 *
 * Usage:
 *   node tools/generate-diagrams.mjs           # Generate/overwrite .mmd files
 *   node tools/generate-diagrams.mjs --check   # Exit 0 if up-to-date, 2 if stale
 *
 * Exit codes:
 *   0 — Success (or up-to-date in --check mode)
 *   1 — Error
 *   2 — Diagrams are stale (--check mode only)
 *
 * Inspired by: claude-dashboard/scripts/generate-docs.sh
 * Unlike that Go project, our output IS deterministic (sorted Mermaid text),
 * so simple text comparison is sufficient — no byte-frequency trick needed.
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { resolve, relative, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import * as acorn from 'acorn';
import * as walk from 'acorn-walk';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = resolve(__dirname, '..');
const DOCS_DIR = resolve(PROJECT_ROOT, 'docs');
const DIAGRAMS_DIR = resolve(DOCS_DIR, 'diagrams');
const SCAN_DIRS = [
    resolve(DOCS_DIR, 'lib'),
    resolve(DOCS_DIR, 'scenes'),
];

const MODULE_DEP_FILE = resolve(DIAGRAMS_DIR, 'module-dependencies.mmd');
const CLASS_HIERARCHY_FILE = resolve(DIAGRAMS_DIR, 'class-hierarchy.mmd');
const MODULE_DEP_SVG = resolve(DIAGRAMS_DIR, 'module-dependencies.svg');
const CLASS_HIERARCHY_SVG = resolve(DIAGRAMS_DIR, 'class-hierarchy.svg');

const E_SUCCESS = 0;
const E_ERROR = 1;
const E_STALE = 2;

// Colors (only when writing to a terminal)
const isTTY = process.stdout.isTTY;
const C_INFO = isTTY ? '\x1b[34m' : '';
const C_SUCCESS = isTTY ? '\x1b[32m' : '';
const C_WARN = isTTY ? '\x1b[33m' : '';
const C_ERROR = isTTY ? '\x1b[31m' : '';
const C_RESET = isTTY ? '\x1b[0m' : '';

function info(msg) { console.log(`${C_INFO}[diagrams]${C_RESET} ${msg}`); }
function success(msg) { console.log(`${C_SUCCESS}[diagrams]${C_RESET} ${msg}`); }
function warn(msg) { console.error(`${C_WARN}[diagrams]${C_RESET} ${msg}`); }
function error(msg) { console.error(`${C_ERROR}[diagrams]${C_RESET} ${msg}`); }

// ---------------------------------------------------------------------------
// File discovery
// ---------------------------------------------------------------------------

/**
 * Recursively find all .js files under a directory.
 * @param {string} dir
 * @returns {string[]}
 */
function findJsFiles(dir) {
    const results = [];
    if (!existsSync(dir)) return results;

    for (const entry of readdirSync(dir)) {
        const full = resolve(dir, entry);
        const stat = statSync(full);
        if (stat.isDirectory()) {
            results.push(...findJsFiles(full));
        } else if (entry.endsWith('.js')) {
            results.push(full);
        }
    }
    return results;
}

// ---------------------------------------------------------------------------
// AST parsing & extraction
// ---------------------------------------------------------------------------

/**
 * Parse a single JS file and extract structural information.
 *
 * @param {string} filePath - Absolute path to a .js file
 * @returns {{ imports: Array, classes: Array, exports: Array, functions: Array }}
 */
function parseFile(filePath) {
    const code = readFileSync(filePath, 'utf-8');
    const relPath = relative(DOCS_DIR, filePath);

    let ast;
    try {
        ast = acorn.parse(code, {
            ecmaVersion: 2022,
            sourceType: 'module',
            // Allow top-level await (used in reaction-diffusion/main.js)
            allowAwaitOutsideFunction: true,
        });
    } catch (err) {
        warn(`Failed to parse ${relPath}: ${err.message}`);
        return { imports: [], classes: [], exports: [], functions: [] };
    }

    const imports = [];
    const classes = [];
    const namedExports = [];
    const functions = [];

    // Walk the AST
    walk.simple(ast, {
        ImportDeclaration(node) {
            const source = node.source.value;
            const specifiers = node.specifiers.map(s => {
                if (s.type === 'ImportDefaultSpecifier') {
                    return { imported: 'default', local: s.local.name };
                } else if (s.type === 'ImportNamespaceSpecifier') {
                    return { imported: '*', local: s.local.name };
                } else {
                    return {
                        imported: s.imported.name,
                        local: s.local.name,
                    };
                }
            });
            imports.push({ source, specifiers });
        },

        ClassDeclaration(node) {
            const cls = {
                name: node.id ? node.id.name : '(anonymous)',
                extends: node.superClass ? extractName(node.superClass) : null,
                methods: [],
                properties: [],
            };

            for (const item of node.body.body) {
                // Skip private members (PrivateIdentifier = #name)
                if (item.key && item.key.type === 'PrivateIdentifier') continue;

                if (item.type === 'MethodDefinition') {
                    const name = item.key.name || item.key.value || '(computed)';
                    const prefix = item.static ? 'static ' : '';
                    const kind = item.kind === 'get' ? 'get ' :
                                 item.kind === 'set' ? 'set ' : '';
                    cls.methods.push(`${prefix}${kind}${name}()`);
                } else if (item.type === 'PropertyDefinition') {
                    const name = item.key.name || item.key.value || '(computed)';
                    const prefix = item.static ? 'static ' : '';
                    cls.properties.push(`${prefix}${name}`);
                }
            }

            classes.push(cls);
        },

        ExportNamedDeclaration(node) {
            if (node.declaration) {
                if (node.declaration.type === 'FunctionDeclaration' && node.declaration.id) {
                    namedExports.push(node.declaration.id.name);
                    functions.push(node.declaration.id.name);
                } else if (node.declaration.type === 'ClassDeclaration' && node.declaration.id) {
                    namedExports.push(node.declaration.id.name);
                } else if (node.declaration.type === 'VariableDeclaration') {
                    for (const decl of node.declaration.declarations) {
                        if (decl.id.type === 'Identifier') {
                            namedExports.push(decl.id.name);
                        }
                    }
                }
            }
            if (node.specifiers) {
                for (const spec of node.specifiers) {
                    namedExports.push(spec.exported.name);
                }
            }
        },

        ExportDefaultDeclaration(node) {
            namedExports.push('default');
        },
    });

    return { imports, classes, exports: namedExports, functions };
}

/**
 * Extract a name from an AST node (handles Identifier and MemberExpression).
 */
function extractName(node) {
    if (node.type === 'Identifier') return node.name;
    if (node.type === 'MemberExpression') {
        return `${extractName(node.object)}.${extractName(node.property)}`;
    }
    return '(unknown)';
}

// ---------------------------------------------------------------------------
// Import path resolution
// ---------------------------------------------------------------------------

/**
 * Resolve a relative import path to a docs-relative path.
 * Returns null if the import is external (bare specifier like 'three' or 'lil-gui').
 *
 * @param {string} importSource - The import source string (e.g., '../../lib/core/scene.js')
 * @param {string} importerRelPath - The importer's path relative to docs/ (e.g., 'scenes/line-walker/main.js')
 * @returns {string|null} - Resolved path relative to docs/ or null if external
 */
function resolveImport(importSource, importerRelPath) {
    // Bare specifiers (no ./ or ../) are external — skip them
    if (!importSource.startsWith('.') && !importSource.startsWith('/')) {
        return null;
    }

    const importerDir = dirname(resolve(DOCS_DIR, importerRelPath));
    const resolved = resolve(importerDir, importSource);
    return relative(DOCS_DIR, resolved);
}

// ---------------------------------------------------------------------------
// Mermaid generation
// ---------------------------------------------------------------------------

/**
 * Determine the subgraph key for a file path.
 * Groups by directory under docs/ (e.g., 'lib/core', 'scenes/line-walker').
 */
function getSubgraph(relPath) {
    const dir = dirname(relPath);
    return dir;
}

/**
 * Create a Mermaid-safe node ID from a file path.
 * Replaces / and . with underscores.
 */
function mermaidId(relPath) {
    return relPath.replace(/[/\\.\\-]/g, '_');
}

/**
 * Generate the module dependency Mermaid diagram.
 *
 * @param {Map<string, object>} fileMap - Map of relPath -> parsed data
 * @returns {string} - Mermaid diagram text
 */
export function generateModuleDependencies(fileMap) {
    const lines = ['graph LR'];

    // Collect all subgraphs and their members
    const subgraphs = new Map(); // subgraph name -> [relPath, ...]
    const edges = []; // [fromId, toId, label]

    for (const [relPath, data] of fileMap) {
        const sg = getSubgraph(relPath);
        if (!subgraphs.has(sg)) subgraphs.set(sg, []);
        subgraphs.get(sg).push(relPath);

        // Add edges for imports
        for (const imp of data.imports) {
            const target = resolveImport(imp.source, relPath);
            if (target === null) continue; // external dep
            if (!fileMap.has(target)) continue; // not in our scan
            edges.push([relPath, target]);
        }
    }

    // Sort subgraphs alphabetically
    const sortedSubgraphs = [...subgraphs.entries()].sort((a, b) => a[0].localeCompare(b[0]));

    for (const [sgName, members] of sortedSubgraphs) {
        const sortedMembers = [...members].sort();
        lines.push(`    subgraph ${sgName}`);
        for (const m of sortedMembers) {
            const id = mermaidId(m);
            const label = basename(m);
            lines.push(`        ${id}["${label}"]`);
        }
        lines.push('    end');
    }

    // Sort edges alphabetically by [from, to]
    const sortedEdges = [...edges].sort((a, b) => {
        const cmp = a[0].localeCompare(b[0]);
        return cmp !== 0 ? cmp : a[1].localeCompare(b[1]);
    });

    // Deduplicate edges
    const seenEdges = new Set();
    for (const [from, to] of sortedEdges) {
        const key = `${from}->${to}`;
        if (seenEdges.has(key)) continue;
        seenEdges.add(key);
        lines.push(`    ${mermaidId(from)} --> ${mermaidId(to)}`);
    }

    return lines.join('\n') + '\n';
}

/**
 * Generate the class hierarchy Mermaid diagram.
 *
 * @param {Map<string, object>} fileMap - Map of relPath -> parsed data
 * @returns {string} - Mermaid diagram text
 */
export function generateClassHierarchy(fileMap) {
    const lines = ['classDiagram'];

    // Collect all classes with their source file
    const allClasses = []; // { name, extends, methods, properties, file }
    const exportedFunctions = []; // { name, file }

    for (const [relPath, data] of fileMap) {
        for (const cls of data.classes) {
            allClasses.push({ ...cls, file: relPath });
        }
        for (const fn of data.functions) {
            exportedFunctions.push({ name: fn, file: relPath });
        }
    }

    // Sort classes alphabetically by name
    allClasses.sort((a, b) => a.name.localeCompare(b.name));

    // Generate class definitions
    for (const cls of allClasses) {
        lines.push(`    class ${cls.name} {`);

        // Properties first (sorted)
        const sortedProps = [...cls.properties].sort();
        for (const prop of sortedProps) {
            lines.push(`        +${prop}`);
        }

        // Methods (sorted)
        const sortedMethods = [...cls.methods].sort();
        for (const method of sortedMethods) {
            // Use + for public, - for private (all public in our output since we skip #)
            lines.push(`        +${method}`);
        }

        lines.push('    }');

        // Note which file this class is from
        lines.push(`    note for ${cls.name} "${cls.file}"`);
    }

    // Inheritance edges (sorted)
    const inheritanceEdges = [];
    for (const cls of allClasses) {
        if (cls.extends) {
            inheritanceEdges.push([cls.extends, cls.name]);
        }
    }
    inheritanceEdges.sort((a, b) => {
        const cmp = a[0].localeCompare(b[0]);
        return cmp !== 0 ? cmp : a[1].localeCompare(b[1]);
    });

    for (const [parent, child] of inheritanceEdges) {
        lines.push(`    ${parent} <|-- ${child}`);
    }

    return lines.join('\n') + '\n';
}

// ---------------------------------------------------------------------------
// Graph data (JSON) for use by validate-architecture.mjs
// ---------------------------------------------------------------------------

/**
 * Build a JSON-serializable graph representation for use by the validator.
 *
 * @param {Map<string, object>} fileMap
 * @returns {object}
 */
export function buildGraphData(fileMap) {
    const modules = {};

    for (const [relPath, data] of fileMap) {
        const imports = [];
        for (const imp of data.imports) {
            const target = resolveImport(imp.source, relPath);
            if (target === null) continue;
            if (!fileMap.has(target)) continue;
            imports.push({
                target,
                specifiers: imp.specifiers.map(s => s.imported),
            });
        }

        modules[relPath] = {
            exports: [...data.exports].sort(),
            imports,
            classes: data.classes.map(c => ({
                name: c.name,
                extends: c.extends,
                methods: [...c.methods].sort(),
                properties: [...c.properties].sort(),
            })),
            functions: [...data.functions].sort(),
        };
    }

    return modules;
}

// ---------------------------------------------------------------------------
// SVG rendering via mermaid-cli
// ---------------------------------------------------------------------------

/**
 * Render a .mmd file to .svg using mmdc (mermaid-cli).
 * Warns but does not fail if mmdc is unavailable.
 *
 * @param {string} inputFile - Absolute path to .mmd file
 * @param {string} outputFile - Absolute path to .svg file
 * @returns {boolean} - true if rendering succeeded
 */
function renderSvg(inputFile, outputFile) {
    try {
        execFileSync('npx', ['mmdc', '-i', inputFile, '-o', outputFile], {
            cwd: PROJECT_ROOT,
            stdio: ['pipe', 'pipe', 'pipe'],
            timeout: 60_000,
        });
        return true;
    } catch (err) {
        warn(`Failed to render ${relative(PROJECT_ROOT, outputFile)}: ${err.message}`);
        return false;
    }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

/**
 * Run diagram generation.
 *
 * @param {object} [options]
 * @param {boolean} [options.check=false] - If true, only check; don't write files
 * @returns {{ moduleDep: string, classHierarchy: string, graphData: object }}
 */
export function generate(options = {}) {
    const { check = false } = options;

    // Discover all JS files
    const allFiles = [];
    for (const dir of SCAN_DIRS) {
        allFiles.push(...findJsFiles(dir));
    }
    allFiles.sort();

    info(`Found ${allFiles.length} JS files to parse`);

    // Parse all files
    const fileMap = new Map();
    for (const filePath of allFiles) {
        const relPath = relative(DOCS_DIR, filePath);
        const parsed = parseFile(filePath);
        fileMap.set(relPath, parsed);
    }

    // Generate Mermaid outputs
    const moduleDep = generateModuleDependencies(fileMap);
    const classHierarchy = generateClassHierarchy(fileMap);
    const graphData = buildGraphData(fileMap);

    return { moduleDep, classHierarchy, graphData };
}

function main() {
    const args = process.argv.slice(2);
    const checkMode = args.includes('--check');

    if (checkMode) {
        info('Checking if diagrams are up-to-date...');
    } else {
        info('Generating architecture diagrams...');
    }

    let result;
    try {
        result = generate({ check: checkMode });
    } catch (err) {
        error(`Generation failed: ${err.message}`);
        process.exit(E_ERROR);
    }

    if (checkMode) {
        // Compare against existing files
        let upToDate = true;

        if (existsSync(MODULE_DEP_FILE)) {
            const existing = readFileSync(MODULE_DEP_FILE, 'utf-8');
            if (existing !== result.moduleDep) {
                warn('module-dependencies.mmd is stale');
                upToDate = false;
            }
        } else {
            warn('module-dependencies.mmd does not exist');
            upToDate = false;
        }

        if (existsSync(CLASS_HIERARCHY_FILE)) {
            const existing = readFileSync(CLASS_HIERARCHY_FILE, 'utf-8');
            if (existing !== result.classHierarchy) {
                warn('class-hierarchy.mmd is stale');
                upToDate = false;
            }
        } else {
            warn('class-hierarchy.mmd does not exist');
            upToDate = false;
        }

        if (upToDate) {
            success('Diagrams are up-to-date');
            process.exit(E_SUCCESS);
        } else {
            warn('Diagrams are stale -- regeneration needed');
            process.exit(E_STALE);
        }
    } else {
        // Write files
        writeFileSync(MODULE_DEP_FILE, result.moduleDep);
        info(`Wrote ${relative(PROJECT_ROOT, MODULE_DEP_FILE)}`);

        writeFileSync(CLASS_HIERARCHY_FILE, result.classHierarchy);
        info(`Wrote ${relative(PROJECT_ROOT, CLASS_HIERARCHY_FILE)}`);

        // Also write the graph data JSON (used by validate-architecture.mjs)
        const graphDataFile = resolve(DIAGRAMS_DIR, 'graph-data.json');
        writeFileSync(graphDataFile, JSON.stringify(result.graphData, null, 2) + '\n');
        info(`Wrote ${relative(PROJECT_ROOT, graphDataFile)}`);

        // Render .mmd files to SVG via mermaid-cli
        info('Rendering SVGs...');
        const svgResults = [
            [MODULE_DEP_FILE, MODULE_DEP_SVG],
            [CLASS_HIERARCHY_FILE, CLASS_HIERARCHY_SVG],
        ];
        let svgCount = 0;
        for (const [mmdFile, svgFile] of svgResults) {
            if (renderSvg(mmdFile, svgFile)) {
                info(`Wrote ${relative(PROJECT_ROOT, svgFile)}`);
                svgCount++;
            }
        }
        if (svgCount === svgResults.length) {
            success('All diagrams and SVGs generated!');
        } else if (svgCount > 0) {
            warn(`Generated ${svgCount}/${svgResults.length} SVGs (some failed)`);
        } else {
            warn('SVG rendering skipped (mmdc not available or all renders failed)');
            success('All .mmd diagrams generated!');
        }

        // Output graph data to stdout for piping (only if not a TTY)
        if (!isTTY) {
            process.stdout.write(JSON.stringify(result.graphData));
        }
    }
}

main();
