import { motion } from "framer-motion";
import { Skeleton } from "@/components/ui/skeleton";

export function PaymentProcessingSkeleton() {
  return (
    <div className="space-y-6 py-8">
      <motion.div 
        className="flex flex-col items-center gap-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      >
        {/* Animated processing indicator */}
        <div className="relative">
          <motion.div
            className="w-20 h-20 rounded-full border-4 border-primary/20"
            animate={{
              scale: [1, 1.1, 1],
              opacity: [0.5, 1, 0.5],
            }}
            transition={{
              duration: 1.5,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />
          <motion.div
            className="absolute inset-0 w-20 h-20 rounded-full border-4 border-transparent border-t-primary"
            animate={{ rotate: 360 }}
            transition={{
              duration: 1,
              repeat: Infinity,
              ease: "linear",
            }}
          />
        </div>

        <motion.div
          className="text-center space-y-2"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <h3 className="text-lg font-semibold">Processando pagamento...</h3>
          <p className="text-sm text-muted-foreground">
            Por favor, aguarde enquanto validamos sua transação
          </p>
        </motion.div>
      </motion.div>

      {/* Skeleton content */}
      <motion.div 
        className="space-y-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
      >
        <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-5 w-20" />
        </div>
        
        <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-5 w-16" />
        </div>

        <div className="space-y-2 pt-2">
          <div className="flex gap-2 items-center">
            <motion.div
              className="w-2 h-2 rounded-full bg-primary"
              animate={{ scale: [1, 1.5, 1] }}
              transition={{ duration: 0.6, repeat: Infinity, delay: 0 }}
            />
            <Skeleton className="h-3 w-40" />
          </div>
          <div className="flex gap-2 items-center">
            <motion.div
              className="w-2 h-2 rounded-full bg-primary"
              animate={{ scale: [1, 1.5, 1] }}
              transition={{ duration: 0.6, repeat: Infinity, delay: 0.2 }}
            />
            <Skeleton className="h-3 w-36" />
          </div>
          <div className="flex gap-2 items-center">
            <motion.div
              className="w-2 h-2 rounded-full bg-primary"
              animate={{ scale: [1, 1.5, 1] }}
              transition={{ duration: 0.6, repeat: Infinity, delay: 0.4 }}
            />
            <Skeleton className="h-3 w-44" />
          </div>
        </div>
      </motion.div>

      {/* Progress bar */}
      <motion.div
        className="h-1 bg-muted rounded-full overflow-hidden"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4 }}
      >
        <motion.div
          className="h-full bg-primary rounded-full"
          initial={{ width: "0%" }}
          animate={{ width: "100%" }}
          transition={{
            duration: 3,
            ease: "easeInOut",
            repeat: Infinity,
          }}
        />
      </motion.div>
    </div>
  );
}
