"use client";

import React, { useState, useEffect } from "react";

const STAR_COUNT = 200;
const STAR_COLOR = "#fff";
const STAR_SIZE = 1.2;

// Laser type definition
type Laser = {
  id: number;
  x: number;
  y: number;
  fired: boolean;
  angle: number;
  direction: 'left' | 'right'; // Direction the laser beam emerges from
};

// Function to calculate distance to screen edge
function calculateDistanceToEdge(x: number, y: number, angle: number, width: number, height: number): number {
  // Convert angle to radians
  const angleRad = (angle * Math.PI) / 180;
  
  // Calculate the four possible distances to screen edges
  const distances = [
    // Distance to top edge
    y / Math.sin(angleRad),
    // Distance to bottom edge
    (height - y) / Math.sin(angleRad),
    // Distance to left edge
    x / Math.cos(angleRad),
    // Distance to right edge
    (width - x) / Math.cos(angleRad)
  ];
  
  // Filter out negative and infinite values
  const validDistances = distances.filter(d => d > 0 && isFinite(d));
  
  // Return the minimum valid distance
  return Math.min(...validDistances);
}

// Function to calculate distance in Schwarzschild radius units
const calculateDistanceInRs = (x: number, y: number, BH_SIZE: number): number => {
  const distanceFromCenter = Math.sqrt(x * x + y * y);
  const blackHoleRadius = BH_SIZE * 0.25; // This is our Schwarzschild radius
  return distanceFromCenter / blackHoleRadius;
};

/**
 * Integrate a *photon* geodesic in the equatorial plane (θ = π/2) of
 * a Schwarzschild black hole, starting from a screen point and angle.
 *
 * All lengths are in *pixels*; we simply interpret the on-screen
 * "black-hole radius"  bhSize*0.25  as the Schwarzschild radius r_s.
 *
 * The geodesic equations used are
 *   r'   = p_r
 *   φ'   =  L / r²
 *   p_r' = -½ dV_eff/dr ,   with  V_eff = f L² / r² ,  f = 1 - r_s/r
 *
 * where ( ' ) denotes d/dλ (affine parameter) and
 *   L = r₀² φ̇₀  is fixed by the initial direction.
 */
const calculateLightPath = (
  startX: number,
  startY: number,
  angleDeg: number,
  width: number,
  height: number,
  bhSize: number,
  zoom: number,
  gravityEnabled: boolean
): { x: number; y: number; distToCenter: number }[] => {
  /* ------------ helpers -------------------------------------------------- */
  const rk4 = (
    y: [number, number, number],       // [r, φ, p_r]
    h: number,
    derivs: (y: [number, number, number]) => [number, number, number]
  ): [number, number, number] => {
    const k1 = derivs(y);
    const k2 = derivs([
      y[0] + 0.5 * h * k1[0],
      y[1] + 0.5 * h * k1[1],
      y[2] + 0.5 * h * k1[2],
    ]);
    const k3 = derivs([
      y[0] + 0.5 * h * k2[0],
      y[1] + 0.5 * h * k2[1],
      y[2] + 0.5 * h * k2[2],
    ]);
    const k4 = derivs([
      y[0] + h * k3[0],
      y[1] + h * k3[1],
      y[2] + h * k3[2],
    ]);
    return [
      y[0] + (h / 6) * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]),
      y[1] + (h / 6) * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]),
      y[2] + (h / 6) * (k1[2] + 2 * k2[2] + 2 * k3[2] + k4[2]),
    ];
  };

  /* ------------ screen → BH-centric coordinates -------------------------- */
  const centerX = width / 2;
  const centerY = height / 2;
  const rs = bhSize * 0.25;                       // Schwarzschild radius
  const massFactor = gravityEnabled ? 1 : 0;      // Mass factor for gravity
  const effectiveRs = rs * massFactor;            // Effective Schwarzschild radius
  const relX0 = startX - centerX;
  const relY0 = startY - centerY;

  // Polar coords of the starting point
  const r0 = Math.hypot(relX0, relY0);
  const phi0 = Math.atan2(relY0, relX0);

  // Initial *Euclidean* direction
  const angle = (angleDeg * Math.PI) / 180;
  const vx = Math.cos(angle);
  const vy = Math.sin(angle);

  // Components along {e_r, e_φ}
  const n_r = vx * Math.cos(phi0) + vy * Math.sin(phi0);
  const n_phi = -vx * Math.sin(phi0) + vy * Math.cos(phi0);

  // Affine-parameter scale κ is arbitrary – choose 1
  let p_r0 = n_r;                // ṙ(0)
  const L = n_phi * r0;          // conserved angular momentum

  /* ------------ derivative function -------------------------------------- */
  const derivs = ([r, phi, p_r]: [number, number, number]):
    [number, number, number] => {
    const f = 1 - effectiveRs / r;
    const dVdr = L * L * (-2 / (r ** 3) + (3 * effectiveRs) / (r ** 4));
    return [
      /* dr/dλ   */ p_r,
      /* dφ/dλ   */ L / (r * r),
      /* dp_r/dλ */ -0.5 * dVdr,
    ];
  };

  /* ------------ integration loop ----------------------------------------- */
  const h = rs * 0.01;           // Smaller step size for better accuracy
  const maxSteps = 4000;         // Increased max steps for longer paths
  const points: { x: number; y: number; distToCenter: number }[] = [];

  // Calculate maximum distance based on zoom
  const maxDistance = Math.max(width, height) * (1.5 / zoom);

  let yState: [number, number, number] = [r0, phi0, p_r0];

  for (let step = 0; step < maxSteps; step++) {
    const [r, phi, _pr] = yState;

    // stop if we cross the horizon
    if (r <= effectiveRs * 1.001) break;

    // convert back to screen coords
    const xPix = r * Math.cos(phi) + centerX;
    const yPix = r * Math.sin(phi) + centerY;

    // Calculate distance from center
    const distFromCenter = Math.hypot(xPix - centerX, yPix - centerY);

    // stop if we exceed maximum distance or leave the canvas
    const factor = 2/zoom;
    if (distFromCenter > maxDistance || 
        xPix < -factor*width || xPix > width * factor || 
        yPix < -factor*height || yPix > height * factor) break;

    points.push({
      x: xPix,
      y: yPix,
      distToCenter: zoom,
    });

    // one RK4 step
    yState = rk4(yState, h, derivs);
  }

  return points;
};

// Function to normalize angle to 0-360 range
const normalizeAngle = (angle: number): number => {
  return ((angle % 360) + 360) % 360;
};

// Function to generate stars with consistent positions
const generateStars = (width: number, height: number) => {
  return Array.from({ length: STAR_COUNT }, (_, i) => {
    // Use a deterministic seed based on the index
    const seed = i * 16807 % 2147483647;
    const x = (seed % width);
    const y = ((seed * 16807) % 2147483647) % height;
    const r = ((seed * 16807) % 2147483647) % STAR_SIZE + 0.2;
    const o = ((seed * 16807) % 2147483647) % 0.7 + 0.3;
    return { x, y, r, o };
  });
};

export default function BlackHole() {
  const [zoom, setZoom] = useState(1);
  const minZoom = 0.2;
  const maxZoom = 2.5;
  const [showGrid, setShowGrid] = useState(false);
  const [gravityEnabled, setGravityEnabled] = useState(false);
  const [editingLaser, setEditingLaser] = useState<{ id: number; x: string; y: string; angle: string } | null>(null);

  // Initialize with empty arrays and default size
  const [size, setSize] = useState({ width: 800, height: 800 });
  const [stars, setStars] = useState<Array<{ x: number; y: number; r: number; o: number }>>([]);
  const [isClient, setIsClient] = useState(false);

  // Handle initial client-side setup
  useEffect(() => {
    setIsClient(true);
  }, []);

  // Handle window resize and star generation
  useEffect(() => {
    if (!isClient) return;

    function handleResize() {
      const newSize = { width: window.innerWidth, height: window.innerHeight };
      setSize(newSize);
      
      // Generate stars with consistent positions
      const newStars = generateStars(newSize.width, newSize.height);
      setStars(newStars);
    }
    
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [isClient]);

  // State to track placed lasers
  const [lasers, setLasers] = useState<Laser[]>([]);
  const [nextId, setNextId] = useState(0);

  // Drag state
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [draggedLaserId, setDraggedLaserId] = useState<number | null>(null);
  const [rotatingLaserId, setRotatingLaserId] = useState<number | null>(null);
  const [lastMouseX, setLastMouseX] = useState<number | null>(null);

  // Add state for tracking if all lasers are on
  const [allLasersOn, setAllLasersOn] = useState(false);

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    setZoom((z) => {
      let next = z - e.deltaY * 0.001;
      if (next < minZoom) next = minZoom;
      if (next > maxZoom) next = maxZoom;
      return next;
    });
  };

  // Black hole SVG size
  const BH_SIZE = Math.min(size.width, size.height, 600);

  // Handle click to place a laser
  const handleCanvasClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isDragging) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    // Calculate position relative to the black hole center
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const relativeX = (x - centerX) / zoom;
    const relativeY = (y - centerY) / zoom;
    
    // Calculate distance from click to black hole center
    const distanceFromCenter = Math.hypot(relativeX, relativeY);
    
    // Black hole radius (25% of BH_SIZE)
    const blackHoleRadius = (BH_SIZE * 0.25) / zoom;
    
    // Only create laser if click is outside black hole
    if (distanceFromCenter > blackHoleRadius) {
      const newLaser: Laser = {
        id: nextId,
        x: relativeX,
        y: relativeY,
        fired: true,
        angle: e.shiftKey ? 90 : 0, // Set 90 degrees if shift is pressed, otherwise 0
        direction: 'right', // Default direction
      };
      setLasers((prev) => [...prev, newLaser]);
      setNextId((prev) => prev + 1);
    }
  };

  // Handle double-click to remove a laser
  const handleLaserDoubleClick = (id: number) => {
    setLasers((prev) => prev.filter((laser) => laser.id !== id));
  };

  // Handle mouse down on a laser to start dragging or rotating
  const handleLaserMouseDown = (e: React.MouseEvent<HTMLDivElement>, id: number) => {
    e.stopPropagation();
    
    // Left click for dragging
    if (e.button === 0) {
      setIsDragging(true);
      setDraggedLaserId(id);
      const rect = e.currentTarget.getBoundingClientRect();
      setDragOffset({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      });
    }
    // Right click for rotating or editing
    else if (e.button === 2) {
      e.preventDefault();
      if (e.shiftKey) {
        // Find the laser being edited
        const laser = lasers.find(l => l.id === id);
        if (laser) {
          // Convert coordinates to Rs units
          const xInRs = (laser.x * zoom) / (BH_SIZE * 0.25);
          const yInRs = (laser.y * zoom) / (BH_SIZE * 0.25);
          setEditingLaser({
            id,
            x: xInRs.toFixed(2),
            y: yInRs.toFixed(2),
            angle: laser.angle.toFixed(2)
          });
        }
      } else {
        setRotatingLaserId(id);
        setLastMouseX(e.clientX);
      }
    }
  };

  // Handle input changes for laser editing
  const handleLaserEdit = (field: 'x' | 'y' | 'angle', value: string) => {
    if (editingLaser) {
      setEditingLaser({
        ...editingLaser,
        [field]: value
      });
    }
  };

  // Handle saving edited laser values
  const handleSaveLaserEdit = () => {
    if (editingLaser) {
      // Convert Rs units back to screen coordinates
      const xInPixels = (parseFloat(editingLaser.x) * BH_SIZE * 0.25) / zoom;
      const yInPixels = (parseFloat(editingLaser.y) * BH_SIZE * 0.25) / zoom;
      
      setLasers(prev =>
        prev.map(laser =>
          laser.id === editingLaser.id
            ? {
                ...laser,
                x: xInPixels,
                y: yInPixels,
                angle: parseFloat(editingLaser.angle)
              }
            : laser
        )
      );
      setEditingLaser(null);
    }
  };

  // Handle canceling laser edit
  const handleCancelLaserEdit = () => {
    setEditingLaser(null);
  };

  // Handle mouse move to drag or rotate the laser
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (rotatingLaserId !== null && lastMouseX !== null) {
      // Calculate rotation based on horizontal mouse movement
      const deltaX = e.clientX - lastMouseX;
      setLasers((prev) =>
        prev.map((laser) =>
          laser.id === rotatingLaserId
            ? { ...laser, angle: normalizeAngle(laser.angle + deltaX * 0.5) }
            : laser
        )
      );
      setLastMouseX(e.clientX);
    }
    else if (isDragging && draggedLaserId !== null) {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      
      // Calculate position relative to the black hole center
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;
      const relativeX = (x - centerX) / zoom;
      const relativeY = (y - centerY) / zoom;
      
      setLasers((prev) =>
        prev.map((laser) =>
          laser.id === draggedLaserId ? { ...laser, x: relativeX, y: relativeY } : laser
        )
      );
    }
  };

  // Handle mouse up to stop dragging and rotating
  const handleMouseUp = (e: React.MouseEvent) => {
    if (e.button === 0) {
      setIsDragging(false);
      setDraggedLaserId(null);
    }
    else if (e.button === 2) {
      setRotatingLaserId(null);
      setLastMouseX(null);
    }
  };

  // Prevent context menu on right click
  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
  };

  // Function to remove all lasers
  const handleCleanAll = () => {
    setLasers([]);
    setAllLasersOn(false);
  };

  // Function to toggle all lasers
  const handleToggleAll = () => {
    setAllLasersOn(!allLasersOn);
    setLasers(prev => prev.map(laser => ({
      ...laser,
      fired: !allLasersOn
    })));
  };

  return (
    <div
      className="fixed inset-0 flex items-center justify-center overflow-hidden"
      style={{ width: "100vw", height: "100vh" }}
    >
      {/* Sidebar */}
      <div 
        className="absolute left-0 top-0 h-full w-[20%] bg-black/50 backdrop-blur-sm border-r border-white/20 p-6 z-50"
        style={{ pointerEvents: "auto" }}
      >
        <h1 className="text-white text-2xl font-bold mb-6">Black Hole Simulator</h1>
        
        {/* Controls */}
        <div className="space-y-4 mb-8">
          <button
            className="w-full bg-white/10 text-white border border-white/30 rounded-lg px-4 py-2 text-sm hover:bg-white/20 transition"
            onClick={handleCleanAll}
          >
            Clean All
          </button>
          <button
            className="w-full bg-white/10 text-white border border-white/30 rounded-lg px-4 py-2 text-sm hover:bg-white/20 transition"
            onClick={handleToggleAll}
          >
            {allLasersOn ? 'Turn Off All' : 'Turn On All'}
          </button>
          {/* Grid Toggle Button */}
          <div className="flex items-center justify-between">
            <span className="text-white/80 text-sm">Show Grid</span>
            <button
              className={`relative w-12 h-6 rounded-full transition-colors duration-200 ${
                showGrid ? 'bg-blue-500' : 'bg-gray-600'
              }`}
              onClick={() => setShowGrid(!showGrid)}
            >
              <div
                className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform duration-200 ${
                  showGrid ? 'left-7' : 'left-1'
                }`}
              />
            </button>
          </div>
          {/* Gravity Toggle Button */}
          <div className="flex items-center justify-between">
            <span className="text-white/80 text-sm">Gravitation</span>
            <button
              className={`relative w-12 h-6 rounded-full transition-colors duration-200 ${
                gravityEnabled ? 'bg-blue-500' : 'bg-gray-600'
              }`}
              onClick={() => setGravityEnabled(!gravityEnabled)}
            >
              <div
                className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform duration-200 ${
                  gravityEnabled ? 'left-7' : 'left-1'
                }`}
              />
            </button>
          </div>
        </div>

        {/* Instructions */}
        <div className="text-white/80 space-y-4 mb-8">
          <h2 className="text-lg font-semibold">How to Use</h2>
          <ul className="space-y-2 text-sm">
            <li>• Click anywhere to place a laser</li>
            <li>• Right-click and drag to rotate</li>
            <li>• Left-click and drag to move</li>
            <li>• Double-click to remove a laser</li>
            <li>• Use mouse wheel to zoom in/out</li>
          </ul>
        </div>

        {/* Zoom controls */}
        <div className="flex gap-4">
          <button
            className="w-full bg-white/10 text-white border border-white/30 rounded-lg px-4 py-2 text-xl hover:bg-white/20 transition"
            onClick={() => setZoom((z) => Math.max(minZoom, z - 0.2))}
          >
            -
          </button>
          <button
            className="w-full bg-white/10 text-white border border-white/30 rounded-lg px-4 py-2 text-xl hover:bg-white/20 transition"
            onClick={() => setZoom((z) => Math.min(maxZoom, z + 0.2))}
          >
            +
          </button>
        </div>
      </div>

      {/* Playground area */}
      <div
        className="absolute left-[20%] top-0 w-[80%] h-full"
        onWheel={handleWheel}
        onClick={handleCanvasClick}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onContextMenu={handleContextMenu}
        tabIndex={0}
      >
        {/* Background overlay when editing */}
        {editingLaser && (
          <div
            className="absolute inset-0 z-30"
            style={{ pointerEvents: "auto" }}
            onClick={(e) => {
              e.stopPropagation();
              handleCancelLaserEdit();
            }}
          />
        )}

        {/* Coordinate Grid */}
        {showGrid && (
          <div
            className="absolute inset-0 z-10"
            style={{
              pointerEvents: "none",
              opacity: 0.5,
            }}
          >
            {/* Calculate the range of visible coordinates in Rs units */}
            {(() => {
              const rs = BH_SIZE * 0.25;
              const maxRs = Math.ceil(Math.max(size.width, size.height) / (rs * zoom) / 2);
              const step = 0.5; // Half Rs unit steps
              const lines = [];
              
              // Generate lines for both integer and semi-integer values
              // Start from -maxRs and go to maxRs to ensure symmetry
              for (let i = -maxRs; i <= maxRs; i += step) {
                // Skip if not integer or semi-integer
                if (i % 1 !== 0 && i % 1 !== 0.5) continue;
                
                // Convert Rs to screen coordinates
                const screenPos = i * rs * zoom;
                
                // Add vertical line
                lines.push(
                  <div
                    key={`v-${i}`}
                    className="absolute top-0 bottom-0 w-px bg-white/20"
                    style={{
                      left: `calc(50% + ${screenPos}px)`,
                    }}
                  />
                );
                
                // Add horizontal line
                lines.push(
                  <div
                    key={`h-${i}`}
                    className="absolute left-0 right-0 h-px bg-white/20"
                    style={{
                      top: `calc(50% + ${screenPos}px)`,
                    }}
                  />
                );
                
                // Add coordinate labels for all values
                // X-axis label
                lines.push(
                  <div
                    key={`x-${i}`}
                    className="absolute text-white/50 text-xs"
                    style={{
                      left: `calc(50% + ${screenPos}px)`,
                      bottom: '0',
                      transform: 'translateX(-50%)',
                    }}
                  >
                    {i.toFixed(2)}
                  </div>
                );
                
                // Y-axis label (invert the sign for Y-axis to match coordinate system)
                lines.push(
                  <div
                    key={`y-${i}`}
                    className="absolute text-white/50 text-xs"
                    style={{
                      top: `calc(50% + ${screenPos}px)`,
                      left: '0',
                      transform: 'translateY(-50%)',
                    }}
                  >
                    {(-i).toFixed(2)}
                  </div>
                );
              }
              
              return lines;
            })()}
          </div>
        )}

        {/* Starry background - only render when on client */}
        {isClient && (
          <svg
            className="absolute inset-0 w-full h-full z-0"
            width={size.width}
            height={size.height}
            style={{ display: "block" }}
          >
            {stars.map((star, i) => (
              <circle
                key={i}
                cx={star.x}
                cy={star.y}
                r={star.r}
                fill={STAR_COLOR}
                opacity={star.o}
              />
            ))}
          </svg>
        )}

        {/* Dashed ring */}
        <div
          className="absolute left-1/2 top-1/2 z-10"
          style={{
            transform: `translate(-50%, -50%) scale(${zoom})`,
            transition: "transform 0.2s cubic-bezier(.4,2,.6,1)",
          }}
        >
          <svg width={BH_SIZE} height={BH_SIZE}>
            <circle
              cx={BH_SIZE / 2}
              cy={BH_SIZE / 2}
              r={BH_SIZE * 0.25}
              fill="none"
              stroke="#aaa"
              strokeWidth={BH_SIZE * 0.004}
              strokeDasharray={`${BH_SIZE * 0.01} ${BH_SIZE * 0.01}`}
              opacity={0.7}
            />
          </svg>
        </div>

        {/* Placed lasers */}
        <div
          className="absolute left-1/2 top-1/2 z-20"
          style={{
            transform: `translate(-50%, -50%) scale(${zoom})`,
            transition: "transform 0.2s cubic-bezier(.4,2,.6,1)",
            pointerEvents: "auto",
          }}
        >
          {lasers.map((laser) => {
            // Calculate the distance to the screen edge
            const distance = calculateDistanceToEdge(
              laser.x + size.width / 2,
              laser.y + size.height / 2,
              laser.angle,
              size.width,
              size.height
            );
            
            // Calculate distance in Schwarzschild radius units
            const distanceInRs = calculateDistanceInRs(laser.x, laser.y, BH_SIZE);
            
            return (
              <div
                key={laser.id}
                className="absolute"
                style={{
                  left: laser.x,
                  top: laser.y,
                  transform: "translate(-50%, -50%)",
                  cursor: "pointer",
                  pointerEvents: "auto",
                }}
                onClick={(e) => {
                  e.stopPropagation();
                }}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  handleLaserDoubleClick(laser.id);
                }}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  handleLaserMouseDown(e, laser.id);
                }}
              >
                <div
                  className="w-6 h-3 bg-red-500"
                  style={{
                    transform: `rotate(${laser.angle}deg)`,
                    pointerEvents: "auto",
                  }}
                />
                {editingLaser?.id === laser.id && (
                  <div
                    className="absolute -top-32 left-1/2 transform -translate-x-1/2 bg-black/80 p-2 rounded-lg border border-white/20 z-40"
                    style={{ pointerEvents: "auto" }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="space-y-2">
                      <div className="text-white/60 text-xs mb-2">
                        Use Tab to navigate between fields
                      </div>
                      <div className="flex items-center space-x-2">
                        <span className="text-white/80 text-xs">X:</span>
                        <input
                          type="number"
                          value={editingLaser.x}
                          onChange={(e) => handleLaserEdit('x', e.target.value)}
                          className="w-20 bg-white/10 text-white text-xs px-2 py-1 rounded border border-white/20"
                          step="0.1"
                          onClick={(e) => e.stopPropagation()}
                        />
                      </div>
                      <div className="flex items-center space-x-2">
                        <span className="text-white/80 text-xs">Y:</span>
                        <input
                          type="number"
                          value={editingLaser.y}
                          onChange={(e) => handleLaserEdit('y', e.target.value)}
                          className="w-20 bg-white/10 text-white text-xs px-2 py-1 rounded border border-white/20"
                          step="0.1"
                          onClick={(e) => e.stopPropagation()}
                        />
                      </div>
                      <div className="flex items-center space-x-2">
                        <span className="text-white/80 text-xs">Angle:</span>
                        <input
                          type="number"
                          value={editingLaser.angle}
                          onChange={(e) => handleLaserEdit('angle', e.target.value)}
                          className="w-20 bg-white/10 text-white text-xs px-2 py-1 rounded border border-white/20"
                          step="0.1"
                          onClick={(e) => e.stopPropagation()}
                        />
                      </div>
                      <div className="flex justify-end space-x-2 mt-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCancelLaserEdit();
                          }}
                          className="text-white/80 text-xs px-2 py-1 hover:bg-white/20 rounded"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSaveLaserEdit();
                          }}
                          className="text-white/80 text-xs px-2 py-1 hover:bg-white/20 rounded"
                        >
                          Save
                        </button>
                      </div>
                    </div>
                  </div>
                )}
                {laser.fired && (
                  <div
                    className="absolute top-1/2 left-1/2"
                    style={{
                      transform: `translate(-50%, -50%)`,
                      transformOrigin: 'center center',
                      pointerEvents: "none",
                    }}
                  >
                    {calculateLightPath(
                      laser.x + size.width / 2,
                      laser.y + size.height / 2,
                      laser.angle,
                      size.width,
                      size.height,
                      BH_SIZE,
                      zoom,
                      gravityEnabled
                    ).map((point, index, array) => {
                      const nextPoint = array[index + 1];
                      
                      return (
                        <div key={index}>
                          {/* Draw line to next point if it exists */}
                          {nextPoint && (
                            <div
                              className="absolute bg-red-500"
                              style={{
                                left: `${point.x - (laser.x + size.width / 2)}px`,
                                top: `${point.y - (laser.y + size.height / 2)}px`,
                                width: `${Math.hypot(
                                  nextPoint.x - point.x,
                                  nextPoint.y - point.y
                                )}px`,
                                height: '1px',
                                transformOrigin: '0 0',
                                transform: `rotate(${Math.atan2(
                                  nextPoint.y - point.y,
                                  nextPoint.x - point.x
                                )}rad)`,
                              }}
                            />
                          )}
                          {/* Draw point */}
                          <div
                            className="absolute w-0.5 h-0.5 bg-red-500 rounded-full"
                            style={{
                              left: `${point.x - (laser.x + size.width / 2)}px`,
                              top: `${point.y - (laser.y + size.height / 2)}px`,
                              transform: 'translate(-50%, -50%)',
                            }}
                          />
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Black hole disk */}
        <div
          className="absolute left-1/2 top-1/2 z-30"
          style={{
            transform: `translate(-50%, -50%) scale(${zoom})`,
            transition: "transform 0.2s cubic-bezier(.4,2,.6,1)",
            pointerEvents: "none",
          }}
        >
          <svg width={BH_SIZE} height={BH_SIZE}>
            <circle
              cx={BH_SIZE / 2}
              cy={BH_SIZE / 2}
              r={BH_SIZE * 0.25}
              fill="black"
              filter="url(#blur)"
            />
            <defs>
              <filter id="blur">
                <feGaussianBlur stdDeviation={BH_SIZE * 0.006} />
              </filter>
            </defs>
          </svg>
        </div>
      </div>
    </div>
  );
} 