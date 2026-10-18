/**
 * Pure parser and normalizer for all table structures appearing across exam JSONs:
 * 1. Markdown pipe tables (with or without |---|---| header separator)
 * 2. Single table object: { name?, headers?/header?, rows }
 * 3. Named matrix object: { name?, table: [][] }
 * 4. Array of table objects: [ { name?, headers?, rows }, { name?, table } ]
 * 5. Direct 2D matrix array: [ [cell, cell, ...], ... ]
 * 6. Multi-table dictionary: { table1: {...}, table2: {...} } or { tableR: {...}, tableS: {...} }
 * 7. Relational database instances: { R: [ {A: 1, B: 2}, ... ], S: [ ... ] }
 * 8. External table URL
 */

export interface StructuredTable {
  title?: string;
  headers?: string[];
  rows: string[][];
  isMatrix?: boolean;
  externalUrl?: string;
}

/**
 * Converts a raw `table` / `tables` / `Link bảng` field from an exam JSON
 * into a clean string representation suitable for `Question.table` without
 * ever producing "[object Object]".
 */
export function normalizeTableField(rawQuestion: Record<string, any>): string | undefined {
  const candidates = [
    rawQuestion.table,
    rawQuestion.tables,
    rawQuestion['Link bảng'],
  ];

  for (const raw of candidates) {
    if (raw === undefined || raw === null) continue;

    if (typeof raw === 'string') {
      const trimmed = raw.trim();
      if (!trimmed || trimmed === '[object Object]') continue;
      return trimmed;
    }

    if (Array.isArray(raw)) {
      if (raw.length === 0) continue;
      // If array of strings (e.g. multiple markdown tables), join or JSON-encode
      if (raw.every((item) => typeof item === 'string')) {
        const joined = raw.map((s) => s.trim()).filter(Boolean).join('\n\n');
        if (joined) return joined;
        continue;
      }
      return JSON.stringify(raw);
    }

    if (typeof raw === 'object') {
      if (Object.keys(raw).length === 0) continue;
      return JSON.stringify(raw);
    }
  }

  return undefined;
}

function toCellString(val: unknown): string {
  if (val === null || val === undefined) return '';
  if (typeof val === 'string') return val.trim();
  if (typeof val === 'number' || typeof val === 'boolean') return String(val);
  return JSON.stringify(val);
}

function is2DArray(val: unknown): val is unknown[][] {
  return (
    Array.isArray(val) &&
    val.length > 0 &&
    Array.isArray(val[0]) &&
    !val.some((r) => !Array.isArray(r))
  );
}

function isArrayOfPlainObjects(val: unknown): val is Record<string, unknown>[] {
  return (
    Array.isArray(val) &&
    val.length > 0 &&
    typeof val[0] === 'object' &&
    val[0] !== null &&
    !Array.isArray(val[0])
  );
}

function parseSingleObjectTable(
  obj: Record<string, any>,
  fallbackTitle?: string
): StructuredTable[] {
  const title =
    typeof obj.name === 'string' && obj.name.trim()
      ? obj.name.trim()
      : fallbackTitle;

  // Shape A: { headers/header, rows }
  const rawHeaders = obj.headers || obj.header;
  if (Array.isArray(obj.rows)) {
    const headers = Array.isArray(rawHeaders)
      ? rawHeaders.map(toCellString)
      : undefined;
    const hasNonEmptyHeader = headers && headers.some((h) => h.length > 0);
    const rows = obj.rows.map((r: unknown) =>
      Array.isArray(r) ? r.map(toCellString) : [toCellString(r)]
    );
    return [
      {
        title,
        headers: hasNonEmptyHeader ? headers : undefined,
        rows,
        isMatrix: !hasNonEmptyHeader,
      },
    ];
  }

  // Shape B: { name, table: 2D array }
  if (is2DArray(obj.table)) {
    return [
      {
        title,
        rows: obj.table.map((r) => r.map(toCellString)),
        isMatrix: true,
      },
    ];
  }

  // Shape C: Multi-table dictionary { table1: {...}, table2: {...} } or { R: [...], S: [...] }
  const results: StructuredTable[] = [];
  for (const [key, val] of Object.entries(obj)) {
    if (!val) continue;
    const cleanKey = /^table\d+$/i.test(key)
      ? undefined
      : key.replace(/^table/i, 'Bảng ').trim() || key;

    if (is2DArray(val)) {
      results.push({
        title: cleanKey,
        rows: val.map((r) => r.map(toCellString)),
        isMatrix: true,
      });
    } else if (isArrayOfPlainObjects(val)) {
      // Relational DB table: array of row objects e.g. R: [{A: 1, B: 5}, ...]
      const colSet = new Set<string>();
      val.forEach((rowObj) => Object.keys(rowObj).forEach((k) => colSet.add(k)));
      const headers = Array.from(colSet);
      const rows = val.map((rowObj) => headers.map((h) => toCellString(rowObj[h])));
      results.push({
        title: cleanKey ? `Quan hệ ${cleanKey}` : undefined,
        headers,
        rows,
      });
    } else if (typeof val === 'object' && !Array.isArray(val)) {
      results.push(...parseSingleObjectTable(val as Record<string, any>, cleanKey));
    } else if (typeof val === 'string') {
      results.push(...parseMarkdownTableString(val, cleanKey));
    }
  }

  return results;
}

function isNumericOrFractionCell(cell: string): boolean {
  const c = cell.trim();
  return /^-?\d+([.,/]\d+)?$/.test(c);
}

function parseMarkdownTableString(
  rawStr: string,
  title?: string
): StructuredTable[] {
  const trimmed = rawStr.trim();
  if (!trimmed || trimmed === '[object Object]') return [];

  if (/^https?:\/\//i.test(trimmed)) {
    return [{ title, rows: [], externalUrl: trimmed }];
  }

  // Split into blocks if multiple markdown tables are separated by blank lines
  const blocks = trimmed
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean);

  const tables: StructuredTable[] = [];

  for (const block of blocks) {
    const lines = block
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length === 0) continue;

    let blockTitle = title;
    let tableLines = lines;

    // If first line has no pipe '|' and there are subsequent lines with '|', treat first line as title
    if (!lines[0].includes('|') && lines.length > 1 && lines[1].includes('|')) {
      blockTitle = lines[0].replace(/^#+\s*/, '').trim();
      tableLines = lines.slice(1);
    }

    const parsedRows: string[][] = [];
    let hasDividerRow = false;
    let dividerIndex = -1;

    tableLines.forEach((line, idx) => {
      const rawCells = line.split('|').map((c) => c.trim());
      // Remove empty leading/trailing cells from "| a | b |"
      const cells =
        rawCells.length > 2
          ? rawCells.slice(
              rawCells[0] === '' ? 1 : 0,
              rawCells[rawCells.length - 1] === '' ? rawCells.length - 1 : rawCells.length
            )
          : rawCells.filter(Boolean);

      if (cells.length > 0 && cells.every((c) => /^:?-+:?$/.test(c))) {
        hasDividerRow = true;
        dividerIndex = idx;
      } else if (cells.length > 0) {
        parsedRows.push(cells);
      }
    });

    if (parsedRows.length === 0) continue;

    // Determine whether row 0 is a header or a matrix row
    const firstRow = parsedRows[0];
    const allFirstRowNumeric =
      firstRow.length > 0 && firstRow.every(isNumericOrFractionCell);

    if (hasDividerRow && dividerIndex === 1 && parsedRows.length >= 1) {
      tables.push({
        title: blockTitle,
        headers: parsedRows[0],
        rows: parsedRows.slice(1),
      });
    } else if (!allFirstRowNumeric && parsedRows.length > 1) {
      tables.push({
        title: blockTitle,
        headers: parsedRows[0],
        rows: parsedRows.slice(1),
      });
    } else {
      tables.push({
        title: blockTitle,
        rows: parsedRows,
        isMatrix: true,
      });
    }
  }

  return tables;
}

/**
 * Parses any normalized or raw table input into an array of StructuredTable objects.
 */
export function parseTableData(tableInput: unknown): StructuredTable[] {
  if (!tableInput) return [];

  if (typeof tableInput === 'string') {
    const trimmed = tableInput.trim();
    if (!trimmed || trimmed === '[object Object]') return [];

    // Try JSON parse if it starts with '{' or '['
    if (
      (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
      (trimmed.startsWith('[') && trimmed.endsWith(']'))
    ) {
      try {
        const parsed = JSON.parse(trimmed);
        return parseTableData(parsed);
      } catch {
        // Fall through to markdown parser
      }
    }

    return parseMarkdownTableString(trimmed);
  }

  if (Array.isArray(tableInput)) {
    if (tableInput.length === 0) return [];

    // Direct 2D matrix array e.g. [["0", "1/2"], ["1/2", "0"]]
    if (is2DArray(tableInput)) {
      const firstRow = tableInput[0].map(toCellString);
      const isMatrix = firstRow.every(isNumericOrFractionCell);
      return [
        {
          headers: !isMatrix && tableInput.length > 2 ? firstRow : undefined,
          rows: (!isMatrix && tableInput.length > 2
            ? tableInput.slice(1)
            : tableInput
          ).map((r) => r.map(toCellString)),
          isMatrix: isMatrix || tableInput.length <= 2,
        },
      ];
    }

    // Array of table objects or strings
    const results: StructuredTable[] = [];
    for (const item of tableInput) {
      if (typeof item === 'string') {
        results.push(...parseMarkdownTableString(item));
      } else if (item && typeof item === 'object' && !Array.isArray(item)) {
        results.push(...parseSingleObjectTable(item as Record<string, any>));
      }
    }
    return results;
  }

  if (typeof tableInput === 'object') {
    return parseSingleObjectTable(tableInput as Record<string, any>);
  }

  return [];
}
