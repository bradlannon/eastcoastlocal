export const dynamic = 'force-dynamic';

import { getAIProviderSetting } from './actions';
import { AIProviderToggle } from './_components/AIProviderToggle';

export default async function SettingsPage() {
  const currentProvider = await getAIProviderSetting();

  return (
    <div>
      <h1 className="text-xl font-bold text-gray-900 mb-6">Settings</h1>

      <div className="bg-white rounded-lg border shadow-sm p-6 max-w-xl">
        <h2 className="text-base font-semibold text-gray-900 mb-1">
          AI Provider
        </h2>
        <p className="text-sm text-gray-500 mb-4">
          Choose which AI model extracts events from venue pages and Reddit
          posts. Venue discovery (Google Search) always uses Gemini.
        </p>
        <AIProviderToggle currentProvider={currentProvider} />
      </div>
    </div>
  );
}
