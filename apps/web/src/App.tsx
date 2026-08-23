import { localDate } from '@corvonium/shared';

export default function App() {
  return (
    <div className="min-h-dvh bg-[#0A0E0C] text-[#E8EFE9] flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight">
          Corvo<span className="text-[#4CC26A]">nium</span>
        </h1>
        <p className="mt-2 text-sm text-[#8A9990]">
          {localDate(Date.now())}
        </p>
      </div>
    </div>
  );
}