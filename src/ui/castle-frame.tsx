import type { RefObject, ReactNode } from 'react';

interface CastleFrameProps {
  viewportRef: RefObject<HTMLDivElement>;
  children?: ReactNode;
}

export function CastleFrame({ viewportRef, children }: CastleFrameProps): JSX.Element {
  return (
    <div className="castle-viewport relative mx-auto w-full max-w-lg flex-1 min-h-0 px-2 py-1">
      <div className="castle-frame relative h-full w-full">
        <div className="castle-frame__pillar castle-frame__pillar--left" aria-hidden />
        <div className="castle-frame__pillar castle-frame__pillar--right" aria-hidden />
        <div className="castle-frame__lintel" aria-hidden />
        <div className="castle-frame__sill" aria-hidden />
        <div ref={viewportRef} className="murder-hole relative h-full w-full overflow-hidden">
          {children}
        </div>
      </div>
    </div>
  );
}
