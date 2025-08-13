import { z } from 'zod';
import regression from 'regression';

// Define the parameter types to match the zod schema
type ForecastParams = {
  data: number[];
  periods?: number;
  interval?: 'days' | 'weeks' | 'months';
};

const forecast = {
  id: 'forecast',
  name: 'Forecast',
  description: 'Useful for forecasting future values based on time series analysis',
  inputSchema: z.object({
    data: z.array(z.number()).describe('Array of numerical time series data points'),
    periods: z.number().min(1).max(12).default(5).describe('Number of periods to forecast (1-12)'),
    interval: z
      .enum(['days', 'weeks', 'months'])
      .default('days')
      .describe('Time interval (days, weeks, months)'),
  }),
  execute: async ({ data, periods = 5, interval = 'days' }: ForecastParams) => {
    console.log('Processing forecast:', {
      dataLength: data.length,
      periods,
      interval,
    });

    try {
      if (data.some((val) => !Number.isFinite(val))) {
        throw new Error('Invalid data points detected');
      }

      const points = data.map((y, x) => [x + 1, y] as [number, number]);
      const models = [
        regression.linear(points),
        regression.polynomial(points, { order: 2 }),
        regression.logarithmic(points),
      ].filter((model) => Number.isFinite(model.r2));

      if (models.length === 0) {
        throw new Error('No valid regression models found');
      }

      const bestModel = models.reduce((a, b) => (a.r2 > b.r2 ? a : b));
      const forecast = Array.from({ length: periods }, (_, i) => {
        const x = data.length + i + 1;
        const predicted = bestModel.predict(x)[1];
        return Number(predicted.toFixed(2));
      });

      const residuals = points.map(([x, y]) => y - bestModel.predict(x)[1]);
      const standardError = Math.sqrt(
        residuals.reduce((a, b) => a + b * b, 0) / (points.length - 2),
      );
      const confidenceInterval = standardError * 1.96;

      // Return a formatted string instead of an object
      return `
      Based on the analysis of ${data.length} data points:

      1. Forecast for the next ${periods} ${interval}:
        ${forecast.join(', ')}

      2. Confidence Intervals (95%):
        Lower: ${forecast.map((val) => Number((val - confidenceInterval).toFixed(2))).join(', ')}
        Upper: ${forecast.map((val) => Number((val + confidenceInterval).toFixed(2))).join(', ')}

      3. Model Information:
        Type: ${bestModel.string}
        Accuracy (R²): ${bestModel.r2.toFixed(3)}
      `;
    } catch (error) {
      console.error('Forecasting error:', error);
      return `Error: Could not generate forecast: ${
        error instanceof Error ? error.message : 'Unknown error'
      }`;
    }
  },
};

export { forecast };
