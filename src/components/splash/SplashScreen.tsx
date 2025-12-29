import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import optimusLogo from "@/assets/optimus-logo.png";

interface SplashScreenProps {
  onComplete: () => void;
  duration?: number;
}

export const SplashScreen = ({ onComplete, duration = 2500 }: SplashScreenProps) => {
  const [phase, setPhase] = useState<"enter" | "pulse" | "exit">("enter");

  useEffect(() => {
    // Phase 1: Logo enters (500ms)
    const enterTimer = setTimeout(() => {
      setPhase("pulse");
    }, 500);

    // Phase 2: Pulse animation runs, then exit
    const exitTimer = setTimeout(() => {
      setPhase("exit");
    }, duration - 500);

    // Phase 3: Complete and redirect
    const completeTimer = setTimeout(() => {
      onComplete();
    }, duration);

    return () => {
      clearTimeout(enterTimer);
      clearTimeout(exitTimer);
      clearTimeout(completeTimer);
    };
  }, [duration, onComplete]);

  return (
    <AnimatePresence>
      {phase !== "exit" ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="fixed inset-0 z-50 bg-background flex items-center justify-center overflow-hidden"
        >
          {/* Animated Background Orbs */}
          <div className="absolute inset-0 overflow-hidden">
            <motion.div
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 0.2 }}
              transition={{ duration: 1, ease: "easeOut" }}
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full bg-primary blur-[150px]"
            />
            <motion.div
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 0.15 }}
              transition={{ duration: 1.2, ease: "easeOut", delay: 0.2 }}
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-purple-500 blur-[120px]"
            />
          </div>

          {/* Logo Container */}
          <div className="relative z-10 flex flex-col items-center">
            {/* Glow Ring */}
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ 
                scale: [0.8, 1.2, 1], 
                opacity: [0, 0.5, 0.3] 
              }}
              transition={{ 
                duration: 1.5, 
                ease: "easeOut",
                times: [0, 0.6, 1]
              }}
              className="absolute w-40 h-40 rounded-full bg-primary/30 blur-xl"
            />

            {/* Logo */}
            <motion.div
              initial={{ scale: 0, opacity: 0, rotateY: -180 }}
              animate={{ 
                scale: 1, 
                opacity: 1, 
                rotateY: 0 
              }}
              transition={{ 
                duration: 0.8, 
                ease: [0.34, 1.56, 0.64, 1],
                delay: 0.1
              }}
              className="relative"
            >
              <motion.img
                src={optimusLogo}
                alt="Optimus CRM"
                className="h-24 w-auto drop-shadow-2xl"
                animate={phase === "pulse" ? {
                  scale: [1, 1.05, 1],
                  filter: [
                    "drop-shadow(0 0 20px rgba(var(--primary), 0.3))",
                    "drop-shadow(0 0 40px rgba(var(--primary), 0.6))",
                    "drop-shadow(0 0 20px rgba(var(--primary), 0.3))"
                  ]
                } : {}}
                transition={{
                  duration: 1.5,
                  repeat: Infinity,
                  ease: "easeInOut"
                }}
              />
            </motion.div>

            {/* Loading dots */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5, duration: 0.5 }}
              className="flex items-center gap-1.5 mt-8"
            >
              {[0, 1, 2].map((i) => (
                <motion.div
                  key={i}
                  className="w-2 h-2 rounded-full bg-primary"
                  animate={{
                    scale: [1, 1.3, 1],
                    opacity: [0.5, 1, 0.5],
                  }}
                  transition={{
                    duration: 0.8,
                    repeat: Infinity,
                    delay: i * 0.15,
                    ease: "easeInOut",
                  }}
                />
              ))}
            </motion.div>

            {/* Welcome text */}
            <motion.p
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.7, duration: 0.5 }}
              className="mt-4 text-muted-foreground text-sm"
            >
              Preparando seu ambiente...
            </motion.p>
          </div>

          {/* Particle effects */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            {[...Array(6)].map((_, i) => (
              <motion.div
                key={i}
                className="absolute w-1 h-1 rounded-full bg-primary/60"
                initial={{
                  x: "50vw",
                  y: "50vh",
                  scale: 0,
                }}
                animate={{
                  x: `${30 + Math.random() * 40}vw`,
                  y: `${30 + Math.random() * 40}vh`,
                  scale: [0, 1, 0],
                  opacity: [0, 1, 0],
                }}
                transition={{
                  duration: 2,
                  delay: 0.3 + i * 0.1,
                  ease: "easeOut",
                }}
              />
            ))}
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
};
