import Trackee from '../src/index';

// Set TRACKEE_API_KEY before running this example. Creating scans consumes credits.
const client = new Trackee();
const { data: brands } = await client.brands.list();
console.log(brands.data);

const { data: scan } = await client.scans.create({
  body: {
    brand: 'Acme',
    domain: 'acme.com',
    prompts: ['What are the best project management tools?'],
    engines: ['chatgpt'],
  },
});
console.log('Scan:', scan.data.id, 'Credits charged:', scan.credits.charged);

// The API returns immediately. Call this later to inspect progress and results.
const { data: progress } = await client.scans.get({ path: { id: scan.data.id } });
console.log(progress.data.done, progress.data.results);
