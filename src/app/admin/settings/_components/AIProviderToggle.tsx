'use client';

import { useState, useTransition } from 'react';
import { setAIProvider } from '../actions';
import type { AIProvider } from '@/lib/ai/model';

const PROVIDERS: { value: AIProvider; label: string; description: string }[] = [
  {
    value: 'gemini',
    label: 'Gemini 2.5 Flash',
    description: 'Google — fast and cost-effective',
  },
  {
    value: 'claude',
    label: 'Claude Sonnet 4.5',
    description: 'Anthropic — high accuracy',
  },
];

export function AIProviderToggle({
  currentProvider,
}: {
  currentProvider: AIProvider;
}) {
  const [selected, setSelected] = useState<AIProvider>(currentProvider);
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  function handleChange(provider: AIProvider) {
    setSelected(provider);
    setSaved(false);
    startTransition(async () => {
      await setAIProvider(provider);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    });
  }

  return (
    <div className="space-y-3">
      {PROVIDERS.map(({ value, label, description }) => (
        <label
          key={value}
          className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
            selected === value
              ? 'border-blue-500 bg-blue-50'
              : 'border-gray-200 hover:border-gray-300'
          } ${isPending ? 'opacity-60 pointer-events-none' : ''}`}
        >
          <input
            type="radio"
            name="ai_provider"
            value={value}
            checked={selected === value}
            onChange={() => handleChange(value)}
            className="accent-blue-600"
          />
          <div>
            <div className="text-sm font-medium text-gray-900">{label}</div>
            <div className="text-xs text-gray-500">{description}</div>
          </div>
        </label>
      ))}

      {saved && (
        <p className="text-sm text-green-600">Saved</p>
      )}
    </div>
  );
}
