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

// Function to calculate points along the light path
const calculateLightPath = (
  startX: number,
  startY: number,
  angle: number,
  width: number,
  height: number,
  bhSize: number
): { x: number; y: number; distToCenter: number }[] => {
  const points: { x: number; y: number; distToCenter: number }[] = [];
  const stepSize = 10; // Distance between dots
  const angleRad = (angle * Math.PI) / 180;
  
  // Direction vector
  const dx = Math.cos(angleRad);
  const dy = Math.sin(angleRad);
  
  // Black hole parameters
  const blackHoleRadius = bhSize * 0.25;
  const centerX = width / 2;
  const centerY = height / 2;
  
  // Convert start position to relative coordinates
  const relativeStartX = startX - centerX;
  const relativeStartY = startY - centerY;
  
  let currentX = relativeStartX;
  let currentY = relativeStartY;
  
  let steps = 0;
  while (true) {
    // Calculate distance to black hole center in relative coordinates
    const distToCenter = Math.sqrt(currentX * currentX + currentY * currentY);
    
    // Convert distance to Schwarzschild radius units
    const distInRs = distToCenter / blackHoleRadius;
    
    // Stop if we hit the black hole
    if (distInRs <= 1) {
      break;
    }
    
    // Stop if we hit the screen edge
    if (
      currentX + centerX < 0 || 
      currentX + centerX > width || 
      currentY + centerY < 0 || 
      currentY + centerY > height
    ) {
      break;
    }
    
    // Add current point with distance in Rs units
    points.push({ 
      x: currentX + centerX, 
      y: currentY + centerY, 
      distToCenter: distInRs
    });
    
    // Move to next point
    currentX += dx * stepSize;
    currentY += dy * stepSize;

    steps++;
    if(steps > 50) {
      //break;
    }
  }
  
  return points;
};

// Function to normalize angle to 0-360 range
const normalizeAngle = (angle: number): number => {
  return ((angle % 360) + 360) % 360;
};

export default function BlackHole() {
  const [zoom, setZoom] = useState(1);
  const minZoom = 0.5;
  const maxZoom = 2.5;

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
      
      // Generate stars only on the client side
      const newStars = Array.from({ length: STAR_COUNT }, () => ({
        x: Math.random() * newSize.width,
        y: Math.random() * newSize.height,
        r: Math.random() * STAR_SIZE + 0.2,
        o: Math.random() * 0.7 + 0.3,
      }));
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
    const distanceFromCenter = Math.sqrt(relativeX * relativeX + relativeY * relativeY);
    
    // Black hole radius (25% of BH_SIZE)
    const blackHoleRadius = (BH_SIZE * 0.25) / zoom;
    
    // Only create laser if click is outside black hole
    if (distanceFromCenter > blackHoleRadius) {
      const newLaser: Laser = {
        id: nextId,
        x: relativeX,
        y: relativeY,
        fired: false,
        angle: 0, // Zero inclination
        direction: 'right', // Default direction
      };
      setLasers((prev) => [...prev, newLaser]);
      setNextId((prev) => prev + 1);
    }
  };

  // Handle click on a laser to fire it
  const handleLaserClick = (e: React.MouseEvent<HTMLDivElement>, id: number) => {
    if (isDragging) return;
    e.stopPropagation();
    
    const rect = e.currentTarget.getBoundingClientRect();
    const laserX = rect.left + rect.width / 2;
    
    // Determine direction based on which side of the laser was clicked
    const direction = e.clientX < laserX ? 'left' : 'right';
    
    setLasers((prev) =>
      prev.map((laser) =>
        laser.id === id ? { ...laser, fired: true, direction } : laser
      )
    );
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
    // Right click for rotating
    else if (e.button === 2) {
      e.preventDefault();
      setRotatingLaserId(id);
      setLastMouseX(e.clientX);
    }
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
        </div>

        {/* Instructions */}
        <div className="text-white/80 space-y-4 mb-8">
          <h2 className="text-lg font-semibold">How to Use</h2>
          <ul className="space-y-2 text-sm">
            <li>• Click anywhere to place a laser</li>
            <li>• Click on a laser to fire it</li>
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
                  handleLaserClick(e, laser.id);
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
                {/* Distance and angle label for laser source */}
                <div
                  className="absolute -top-6 left-1/2 transform -translate-x-1/2 text-white/80 text-xs whitespace-nowrap"
                  style={{
                    pointerEvents: "none",
                  }}
                >
                  {calculateDistanceInRs(laser.x, laser.y, BH_SIZE).toFixed(2)} Rs | {normalizeAngle(laser.angle).toFixed(1)}°
                </div>
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
                      BH_SIZE
                    ).map((point, index, array) => {
                      const isLastPoint = index === array.length - 1;
                      
                      return (
                        <div key={index}>
                          <div
                            className="absolute w-1 h-1 bg-red-500 rounded-full"
                            style={{
                              left: `${point.x - (laser.x + size.width / 2)}px`,
                              top: `${point.y - (laser.y + size.height / 2)}px`,
                              transform: 'translate(-50%, -50%)',
                            }}
                          />
                          {isLastPoint && (
                            <div
                              className="absolute text-white/80 text-xs whitespace-nowrap"
                              style={{
                                left: `${point.x - (laser.x + size.width / 2) + 5}px`,
                                top: `${point.y - (laser.y + size.height / 2) - 10}px`,
                                transform: 'translate(-50%, -50%)',
                              }}
                            >
                              {point.distToCenter.toFixed(2)} Rs
                            </div>
                          )}
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