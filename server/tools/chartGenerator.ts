import { z } from 'zod';

// Define the parameter types to match the zod schema
type ChartGeneratorParams = {
  type: 'line' | 'bar' | 'pie' | 'gantt' | 'sankey' | 'git';
  data: Array<Array<string | number>>;
  title?: string;
  xLabel?: string;
  yLabel?: string;
};

const chartGenerator = {
  id: 'chartGenerator',
  name: 'Chart Generator',
  description: 'Useful for generating Mermaid charts from data',
  inputSchema: z.object({
    type: z
      .enum(['line', 'bar', 'pie', 'gantt', 'sankey', 'git'])
      .describe('Type of chart to generate'),
    data: z
      .array(z.array(z.union([z.string(), z.number()])))
      .describe(
        'Array of data points. For line/bar: [[label, value], ...]. For pie: [[label, value], ...]. For sankey: [[source, target, value], ...]. For git: [[action, params...], ...]',
      ),
    title: z.string().optional().describe('Chart title'),
    xLabel: z.string().optional().describe('X-axis label'),
    yLabel: z.string().optional().describe('Y-axis label'),
  }),
  execute: async ({ type, data, title, xLabel, yLabel }: ChartGeneratorParams) => {
    try {
      let mermaidCode = '';

      switch (type) {
        case 'line':
          mermaidCode = generateLineChart(data, title, xLabel, yLabel);
          break;
        case 'bar':
          mermaidCode = generateBarChart(data, title, xLabel, yLabel);
          break;
        case 'pie':
          mermaidCode = generatePieChart(data, title);
          break;
        case 'gantt':
          mermaidCode = generateGanttChart(data, title);
          break;
        case 'sankey':
          mermaidCode = generateSankeyChart(data);
          break;
        case 'git':
          mermaidCode = generateGitGraph(data);
          break;
      }

      // Return the mermaid code block without any extra spaces or newlines
      const result = `\`\`\`mermaid\n${mermaidCode.trim()}\n\`\`\``;

      console.log('ChartGenerator result:', result);

      return result;
    } catch (error) {
      console.error('Error generating chart:', error);
      return `Error: Could not generate chart: ${
        error instanceof Error ? error.message : 'Unknown error'
      }`;
    }
  },
};

function generateLineChart(
  data: Array<Array<string | number>>,
  title?: string,
  xLabel?: string,
  yLabel?: string,
): string {
  // Extract labels and values from data
  const labels = data.map(([x]) => x?.toString() || '');
  const values = data.map(([, y]) => {
    const num = Number(y);
    return isNaN(num) ? 0 : num; // Convert NaN to 0
  });

  // Construct the chart string
  let chart = 'xychart-beta\n';

  if (title) {
    chart += `title "${title}"\n`;
  }

  // Add x-axis with labels
  chart += `x-axis "${xLabel || ''}" [${labels.map((l) => `"${l}"`).join(',')}]\n`;

  // Calculate y-axis range with validation
  const validValues = values.filter((v) => !isNaN(v));
  const minY = Math.min(...validValues);
  const maxY = Math.max(...validValues);

  // Add y-axis with validated range
  chart += `y-axis "${yLabel || ''}" ${isFinite(minY) ? minY : 0} --> ${
    isFinite(maxY) ? maxY : 1
  }\n`;

  // Add line data
  chart += `line [${values.join(',')}]\n`;

  return chart;
}

function generateBarChart(
  data: Array<Array<string | number>>,
  title?: string,
  xLabel?: string,
  yLabel?: string,
): string {
  // Extract labels and values from data, ensuring numeric conversion
  const labels = data.map(([x]) => x?.toString() || '');
  const values = data.map(([, y]) => {
    const num = Number(y);
    return isNaN(num) ? 0 : num; // Convert NaN to 0
  });

  // Determine Y-axis range
  const minY = 0;
  const maxY = Math.ceil(Math.max(...values.filter((v) => !isNaN(v))) * 1.2); // Adding 20% padding

  // Construct the chart string
  let chart = 'xychart-beta\n';

  if (title) {
    chart += `title "${title}"\n`;
  }

  // Add x-axis with labels
  chart += `x-axis "${xLabel || ''}" [${labels.map((l) => `"${l}"`).join(',')}]\n`;

  // Add y-axis with validated range
  chart += `y-axis "${yLabel || ''}" ${minY} --> ${maxY || 1}\n`; // Default to 1 if maxY is invalid

  // Add bar data
  chart += `bar [${values.join(',')}]\n`;

  return chart;
}

function generatePieChart(data: Array<Array<string | number>>, title?: string): string {
  let chart = 'pie\n';
  if (title) chart += `    title "${title}"\n`;

  data.forEach(([label, value]) => {
    chart += `    "${label}" : ${value}\n`;
  });

  return chart;
}

function generateGanttChart(data: Array<Array<string | number>>, title?: string): string {
  let chart = 'gantt\n';
  if (title) chart += `    title "${title}"\n`;
  chart += '    dateFormat YYYY-MM-DD\n';

  data.forEach(([task, start, end]) => {
    chart += `    ${task} : ${start}, ${end}\n`;
  });

  return chart;
}

function generateSankeyChart(data: Array<Array<string | number>>): string {
  // Construct the chart string
  let chart = 'sankey-beta\n';

  // Add data rows (source, target, value)
  data.forEach(([source, target, value]) => {
    chart += `${source},${target},${value}\n`;
  });

  return chart;
}

function generateGitGraph(data: Array<Array<string | number>>): string {
  let chart = 'gitGraph\n';

  // Process each action in the data array
  data.forEach((row) => {
    const action = row[0].toString().toLowerCase();
    let line = '    ';

    switch (action) {
      case 'commit':
        line += 'commit';
        // Handle optional commit parameters
        if (row[1]) line += ` "${row[1]}"`; // Message
        if (row[2]) line += ` id:"${row[2]}"`;
        if (row[3]) line += ` type:${row[3]}`;
        if (row[4]) line += ` tag:"${row[4]}"`;
        break;
      case 'branch':
        line += `branch ${row[1]}`;
        break;
      case 'checkout':
        line += `checkout ${row[1]}`;
        break;
      case 'merge':
        line += `merge ${row[1]}`;
        break;
    }
    chart += line + '\n';
  });

  return chart;
}

export { chartGenerator };
