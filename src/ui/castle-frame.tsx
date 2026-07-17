import { useMemo, type RefObject, type ReactNode } from 'react';
import { cornerBrickStyle, makeFrameBrickDataUrl } from './frame-brick-texture.js';

interface CastleFrameProps {
  viewportRef: RefObject<HTMLDivElement>;
  children?: ReactNode;
}

export function CastleFrame({ viewportRef, children }: CastleFrameProps): JSX.Element {
  const brickBg = useMemo(() => makeFrameBrickDataUrl(71024, 320), []);
  const brickStyle = useMemo(
    () => ({
      backgroundImage: `url(${brickBg})`,
      backgroundSize: 'cover',
    }),
    [brickBg],
  );

  return (
    <div className="castle-viewport relative mx-auto w-full max-w-lg min-h-0 px-1 py-1">
      <div className="castle-frame relative h-full w-full">
        <div className="castle-frame__merlons" aria-hidden>
          {Array.from({ length: 9 }, (_, i) => (
            <span
              key={i}
              className={`castle-frame__merlon ${i % 3 === 1 ? 'castle-frame__merlon--damaged' : ''}`}
            />
          ))}
        </div>

        <div
          className="castle-frame__pillar castle-frame__pillar--left"
          style={cornerBrickStyle('pillar-l')}
          aria-hidden
        >
          <span className="castle-frame__impact castle-frame__impact--a" />
          <span className="castle-frame__impact castle-frame__impact--b" />
        </div>
        <div
          className="castle-frame__pillar castle-frame__pillar--right"
          style={cornerBrickStyle('pillar-r')}
          aria-hidden
        >
          <span className="castle-frame__impact castle-frame__impact--c" />
        </div>

        <div className="castle-frame__lintel" style={brickStyle} aria-hidden>
          <span className="castle-frame__arrow-slit" />
          <span className="castle-frame__lintel-chip" />
        </div>
        <div className="castle-frame__sill" style={brickStyle} aria-hidden>
          <span className="castle-frame__sill-plank" />
          <span className="castle-frame__sill-plank castle-frame__sill-plank--2" />
        </div>

        <div className="castle-frame__corbel castle-frame__corbel--left" style={brickStyle} aria-hidden />
        <div className="castle-frame__corbel castle-frame__corbel--right" style={brickStyle} aria-hidden />

        <div ref={viewportRef} className="murder-hole relative h-full w-full overflow-hidden">
          <div className="murder-hole__inner-edge" aria-hidden />
          {children}
        </div>
      </div>
    </div>
  );
}
