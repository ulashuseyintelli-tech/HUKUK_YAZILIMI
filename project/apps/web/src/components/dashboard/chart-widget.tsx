'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { BarChart3, PieChart, TrendingUp, RefreshCw } from 'lucide-react';

interface ChartData {
  labels: string[];
  datasets: {
    label: string;
    data: number[];
    backgroundColor?: string[];
    borderColor?: string;
  }[];
}

type ChartType = 'bar' | 'pie' | 'line';

interface ChartWidgetProps {
  title: string;
  type: ChartType;
  endpoint: string;
  height?: number;
}

export function ChartWidget({ title, type, endpoint, height = 200 }: ChartWidgetProps) {
  const [data, setData] = useState<ChartData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, [endpoint]);

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await api.get(endpoint);
      setData(res.data?.data);
    } catch (e) {
      // Demo data based on type
      if (type === 'pie') {
        setData({
          labels: ['Derdest', 'Haciz', 'Satış', 'Hitam'],
          datasets: [{
            label: 'Dosya Durumu',
            data: [45, 25, 15, 15],
            backgroundColor: ['#3b82f6', '#f97316', '#8b5cf6', '#22c55e'],
          }],
        });
      } else if (type === 'bar') {
        setData({
          labels: ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz'],
          datasets: [{
            label: 'Tahsilat',
            data: [120000, 145000, 135000, 165000, 185000, 175000],
            backgroundColor: ['#3b82f6'],
          }],
        });
      } else {
        setData({
          labels: ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz'],
          datasets: [{
            label: 'Dosya Sayısı',
            data: [35, 42, 38, 45, 48, 52],
            borderColor: '#3b82f6',
          }],
        });
      }
    } finally {
      setLoading(false);
    }
  };

  const getIcon = () => {
    switch (type) {
      case 'pie': return <PieChart className="h-5 w-5 text-purple-600" />;
      case 'line': return <TrendingUp className="h-5 w-5 text-green-600" />;
      default: return <BarChart3 className="h-5 w-5 text-blue-600" />;
    }
  };

  const renderChart = () => {
    if (!data) return null;

    if (type === 'pie') {
      const total = data.datasets[0].data.reduce((a, b) => a + b, 0);
      return (
        <div className="flex items-center gap-4">
          {/* Simple Pie Chart */}
          <div className="relative w-32 h-32">
            <svg viewBox="0 0 100 100" className="transform -rotate-90">
              {data.datasets[0].data.map((value, idx) => {
                const percentage = (value / total) * 100;
                const offset = data.datasets[0].data.slice(0, idx).reduce((a, b) => a + (b / total) * 100, 0);
                return (
                  <circle
                    key={idx}
                    cx="50"
                    cy="50"
                    r="40"
                    fill="transparent"
                    stroke={data.datasets[0].backgroundColor?.[idx] || '#ccc'}
                    strokeWidth="20"
                    strokeDasharray={`${percentage * 2.51} 251`}
                    strokeDashoffset={`${-offset * 2.51}`}
                  />
                );
              })}
            </svg>
          </div>
          {/* Legend */}
          <div className="flex-1 space-y-1">
            {data.labels.map((label, idx) => (
              <div key={idx} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: data.datasets[0].backgroundColor?.[idx] }}
                  />
                  <span>{label}</span>
                </div>
                <span className="font-medium">{data.datasets[0].data[idx]}</span>
              </div>
            ))}
          </div>
        </div>
      );
    }

    if (type === 'bar') {
      const maxValue = Math.max(...data.datasets[0].data);
      return (
        <div className="flex items-end gap-2 h-full">
          {data.labels.map((label, idx) => {
            const value = data.datasets[0].data[idx];
            const heightPercent = (value / maxValue) * 100;
            return (
              <div key={idx} className="flex-1 flex flex-col items-center gap-1">
                <span className="text-xs text-gray-500">
                  {value >= 1000 ? `${(value / 1000).toFixed(0)}K` : value}
                </span>
                <div
                  className="w-full bg-blue-500 rounded-t transition-all hover:bg-blue-600"
                  style={{ height: `${heightPercent}%`, minHeight: '4px' }}
                />
                <span className="text-xs text-gray-500">{label}</span>
              </div>
            );
          })}
        </div>
      );
    }

    // Line chart
    const maxValue = Math.max(...data.datasets[0].data);
    const points = data.datasets[0].data.map((value, idx) => {
      const x = (idx / (data.labels.length - 1)) * 100;
      const y = 100 - (value / maxValue) * 100;
      return `${x},${y}`;
    }).join(' ');

    return (
      <div className="relative h-full">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-full">
          {/* Grid lines */}
          {[0, 25, 50, 75, 100].map((y) => (
            <line key={y} x1="0" y1={y} x2="100" y2={y} stroke="#e5e7eb" strokeWidth="0.5" />
          ))}
          {/* Line */}
          <polyline
            points={points}
            fill="none"
            stroke="#3b82f6"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {/* Area */}
          <polygon
            points={`0,100 ${points} 100,100`}
            fill="url(#gradient)"
            opacity="0.2"
          />
          <defs>
            <linearGradient id="gradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#3b82f6" />
              <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
            </linearGradient>
          </defs>
        </svg>
        {/* Labels */}
        <div className="absolute bottom-0 left-0 right-0 flex justify-between text-xs text-gray-500">
          {data.labels.map((label, idx) => (
            <span key={idx}>{label}</span>
          ))}
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl border p-4">
        <div className="h-6 bg-gray-200 rounded w-32 mb-4 animate-pulse" />
        <div className="h-32 bg-gray-100 rounded animate-pulse" />
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold flex items-center gap-2">
          {getIcon()}
          {title}
        </h3>
        <button
          onClick={loadData}
          className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
        >
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>
      <div style={{ height }}>{renderChart()}</div>
    </div>
  );
}

// Preset chart widgets
export function CaseStatusChart() {
  return <ChartWidget title="Dosya Durumu" type="pie" endpoint="/reports/chart/case-status" />;
}

export function MonthlyCollectionChart() {
  return <ChartWidget title="Aylık Tahsilat" type="bar" endpoint="/reports/chart/monthly-collection" height={180} />;
}

export function CaseTrendChart() {
  return <ChartWidget title="Dosya Trendi" type="line" endpoint="/reports/chart/case-trend" height={150} />;
}
