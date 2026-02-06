import matter from 'gray-matter';

export type FrontmatterData = Record<string, unknown>;

export type FrontmatterResult = {
  data: FrontmatterData;
  content: string;
};

export function parseFrontmatter(markdown: string): FrontmatterResult {
  const result = matter(markdown || '');
  const data = (result.data || {}) as FrontmatterData;
  const content = typeof result.content === 'string' ? result.content : '';

  return { data, content };
}

export function stripFrontmatter(markdown: string): string {
  return parseFrontmatter(markdown).content;
}

export function mergeFrontmatter(content: string, data: FrontmatterData): string {
  if (!data || Object.keys(data).length === 0) {
    return content || '';
  }

  return matter.stringify(content || '', data);
}

export function parseVariablesFromFrontmatter(markdown: string): Record<string, string> {
  const { data } = parseFrontmatter(markdown);
  const variables = data.variables;

  if (variables && typeof variables === 'object' && !Array.isArray(variables)) {
    const parsed: Record<string, string> = {};
    Object.entries(variables as Record<string, unknown>).forEach(([key, value]) => {
      if (value === undefined || value === null) return;
      parsed[key] = String(value);
    });
    return parsed;
  }

  const legacy: Record<string, string> = {};
  Object.entries(data).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      legacy[key] = String(value);
    }
  });

  return legacy;
}

export function updateFrontmatterVariables(
  markdown: string,
  variables: Record<string, string>
): string {
  const { data, content } = parseFrontmatter(markdown);
  const cleaned: Record<string, string> = {};

  Object.entries(variables).forEach(([key, value]) => {
    if (value.trim() === '') return;
    cleaned[key] = value;
  });

  if (Object.keys(cleaned).length > 0) {
    data.variables = cleaned;
  } else if ('variables' in data) {
    delete data.variables;
  }

  if (Object.keys(data).length === 0) {
    return content || '';
  }

  return matter.stringify(content || '', data);
}
