"""
Dataset Service: Manages lunar datasets catalog for Chandrayaan-1 and Chandrayaan-2 missions.
Supports filtering, searching, and metadata extraction.
"""

from typing import Optional, List, Dict, Any
import datetime

# Comprehensive scientific lunar dataset catalog
LUNAR_DATASET_CATALOG: List[Dict[str, Any]] = [
    # 1. Chandrayaan-1 TMC Calibrated Product
    {
        "product_id": "ch1_tmc_cal_20090529_001",
        "title": "Chandrayaan-1 TMC Nadir Calibrated Strip 20090529",
        "mission": "Chandrayaan-1",
        "instrument": "Terrain Mapping Camera (TMC-1)",
        "instrument_code": "TMC",
        "product_type": "Calibrated Product",
        "product_type_code": "calibrated",
        "acquisition_time": "2009-05-29T04:22:15.000Z",
        "dimensions": "4000 × 52000 px",
        "spatial_reference": "IAU2000:30100 (Moon 2000 Equidistant Cylindrical)",
        "resolution": "5.0 m/px",
        "file_size": "416.0 MB",
        "format": "PDS3 IMG (.img + .lbl)",
        "processing_status": "Ready",
        "footprint": {
            "region_name": "Mare Tranquillitatis / Apollo 11",
            "lat_min": 0.5,
            "lat_max": 18.5,
            "lon_min": 21.0,
            "lon_max": 25.5,
            "center_lat": 9.5,
            "center_lon": 23.25
        },
        "metadata": {
            "orbit_number": 2415,
            "orbit_altitude_km": 100.2,
            "incidence_angle_deg": 48.6,
            "emission_angle_deg": 0.4,
            "phase_angle_deg": 48.4,
            "solar_azimuth_deg": 84.2,
            "spectral_band": "500 – 850 nm (Panchromatic)",
            "camera_view": "Nadir View (0°)",
            "calibration_level": "Level-2 (ISSDC Radiometric & Geometric)",
            "data_provider": "ISRO / ISSDC Indian Space Science Data Centre"
        }
    },
    # 2. Chandrayaan-2 TMC Calibrated Product
    {
        "product_id": "ch2_tmc_cal_20201115_042",
        "title": "Chandrayaan-2 TMC-2 Calibrated Triplet Strip 20201115",
        "mission": "Chandrayaan-2",
        "instrument": "Terrain Mapping Camera-2 (TMC-2)",
        "instrument_code": "TMC",
        "product_type": "Calibrated Product",
        "product_type_code": "calibrated",
        "acquisition_time": "2020-11-15T12:08:44.000Z",
        "dimensions": "4000 × 48000 px",
        "spatial_reference": "IAU2000:30100 (Moon 2000 Simple Cylindrical)",
        "resolution": "2.5 m/px",
        "file_size": "768.4 MB",
        "format": "PDS4 XML/IMG",
        "processing_status": "Ready",
        "footprint": {
            "region_name": "Boguslawsky E Crater / South Pole",
            "lat_min": -72.0,
            "lat_max": -68.5,
            "lon_min": 52.0,
            "lon_max": 56.5,
            "center_lat": -70.25,
            "center_lon": 54.25
        },
        "metadata": {
            "orbit_number": 5120,
            "orbit_altitude_km": 100.0,
            "incidence_angle_deg": 65.2,
            "emission_angle_deg": 0.2,
            "phase_angle_deg": 65.1,
            "solar_azimuth_deg": 142.8,
            "spectral_band": "500 – 850 nm (Panchromatic)",
            "camera_view": "Fore (+26°) / Nadir (0°) / Aft (-26°)",
            "calibration_level": "Level-2 (ISSDC / SAC Standard)",
            "data_provider": "ISRO / SAC Space Applications Centre"
        }
    },
    # 3. Chandrayaan-1 TMC Derived Ortho Product
    {
        "product_id": "ch1_tmc_ortho_20090529_v2",
        "title": "Chandrayaan-1 TMC Derived Orthorectified Mosaic",
        "mission": "Chandrayaan-1",
        "instrument": "Terrain Mapping Camera (TMC-1)",
        "instrument_code": "TMC",
        "product_type": "Derived Ortho Product",
        "product_type_code": "ortho",
        "acquisition_time": "2009-05-29T04:22:15.000Z",
        "dimensions": "4000 × 6000 px",
        "spatial_reference": "IAU2000:30100 (Moon 2000 Equidistant Cylindrical)",
        "resolution": "5.0 m/px",
        "file_size": "96.4 MB",
        "format": "GeoTIFF (Cloud-Optimized)",
        "processing_status": "Complete",
        "footprint": {
            "region_name": "Mare Tranquillitatis / Cauchy Fault",
            "lat_min": 8.0,
            "lat_max": 10.5,
            "lon_min": 22.0,
            "lon_max": 24.5,
            "center_lat": 9.25,
            "center_lon": 23.25
        },
        "metadata": {
            "orbit_number": 2415,
            "orbit_altitude_km": 100.2,
            "incidence_angle_deg": 48.6,
            "emission_angle_deg": 0.0,
            "phase_angle_deg": 48.6,
            "solar_azimuth_deg": 84.2,
            "spectral_band": "Panchromatic (Geo-aligned)",
            "camera_view": "Orthorectified Nadir",
            "calibration_level": "Level-3 Derived Orthorectified Product",
            "data_provider": "ISRO / Chandracrawl Pipeline v2.0"
        }
    },
    # 4. Chandrayaan-2 TMC Derived Ortho Product
    {
        "product_id": "ch2_tmc_ortho_20201115_v1",
        "title": "Chandrayaan-2 TMC-2 Derived Orthorectified Product",
        "mission": "Chandrayaan-2",
        "instrument": "Terrain Mapping Camera-2 (TMC-2)",
        "instrument_code": "TMC",
        "product_type": "Derived Ortho Product",
        "product_type_code": "ortho",
        "acquisition_time": "2020-11-15T12:08:44.000Z",
        "dimensions": "6000 × 8000 px",
        "spatial_reference": "IAU2000:30120 (Lunar Polar Stereographic South)",
        "resolution": "2.5 m/px",
        "file_size": "192.8 MB",
        "format": "GeoTIFF",
        "processing_status": "Complete",
        "footprint": {
            "region_name": "Boguslawsky E South Rim",
            "lat_min": -71.5,
            "lat_max": -69.2,
            "lon_min": 52.8,
            "lon_max": 55.4,
            "center_lat": -70.35,
            "center_lon": 54.10
        },
        "metadata": {
            "orbit_number": 5120,
            "orbit_altitude_km": 100.0,
            "incidence_angle_deg": 65.2,
            "emission_angle_deg": 0.0,
            "phase_angle_deg": 65.2,
            "solar_azimuth_deg": 142.8,
            "spectral_band": "Panchromatic High-Definition",
            "camera_view": "Orthorectified Stereo Base",
            "calibration_level": "Level-3 Derived Ortho Product",
            "data_provider": "ISRO / SAC"
        }
    },
    # 5. Chandrayaan-1 TMC Derived DTM
    {
        "product_id": "ch1_tmc_dtm_20090529_d10",
        "title": "Chandrayaan-1 TMC Stereo Digital Terrain Model (DTM)",
        "mission": "Chandrayaan-1",
        "instrument": "Terrain Mapping Camera (TMC-1)",
        "instrument_code": "TMC",
        "product_type": "Derived Digital Terrain Model (DTM)",
        "product_type_code": "dtm",
        "acquisition_time": "2009-05-29T04:22:15.000Z",
        "dimensions": "2000 × 3000 px",
        "spatial_reference": "IAU2000:30100 (Moon 2000 Equidistant Cylindrical)",
        "resolution": "10.0 m/px",
        "file_size": "48.2 MB",
        "format": "GeoTIFF (32-bit Float Elevation)",
        "processing_status": "Complete",
        "footprint": {
            "region_name": "Mare Tranquillitatis Rille Structure",
            "lat_min": 8.0,
            "lat_max": 10.5,
            "lon_min": 22.0,
            "lon_max": 24.5,
            "center_lat": 9.25,
            "center_lon": 23.25
        },
        "metadata": {
            "orbit_number": 2415,
            "orbit_altitude_km": 100.2,
            "elevation_range_m": "-2840 m to -1920 m (Lunar Datum)",
            "vertical_accuracy_m": "5.0 m",
            "stereo_parallax_angle": "52.0° (Fore to Aft B/H ratio 0.98)",
            "camera_view": "Stereo Triplet Derived Elevation",
            "calibration_level": "Level-4 Topographic Digital Terrain Model",
            "data_provider": "ISRO / SAC Photogrammetry Division"
        }
    },
    # 6. Chandrayaan-2 TMC Derived DTM
    {
        "product_id": "ch2_tmc_dtm_20201115_d05",
        "title": "Chandrayaan-2 TMC-2 High-Resolution Lunar DTM",
        "mission": "Chandrayaan-2",
        "instrument": "Terrain Mapping Camera-2 (TMC-2)",
        "instrument_code": "TMC",
        "product_type": "Derived Digital Terrain Model (DTM)",
        "product_type_code": "dtm",
        "acquisition_time": "2020-11-15T12:08:44.000Z",
        "dimensions": "3000 × 4000 px",
        "spatial_reference": "IAU2000:30120 (Lunar Polar Stereographic South)",
        "resolution": "5.0 m/px",
        "file_size": "96.0 MB",
        "format": "GeoTIFF (32-bit Float Elevation)",
        "processing_status": "Complete",
        "footprint": {
            "region_name": "Boguslawsky E Complex Crater Wall",
            "lat_min": -71.5,
            "lat_max": -69.2,
            "lon_min": 52.8,
            "lon_max": 55.4,
            "center_lat": -70.35,
            "center_lon": 54.10
        },
        "metadata": {
            "orbit_number": 5120,
            "orbit_altitude_km": 100.0,
            "elevation_range_m": "-3680 m to -940 m",
            "vertical_accuracy_m": "3.0 m",
            "stereo_parallax_angle": "52.0° (Base-to-Height 0.98)",
            "camera_view": "Stereo Triplet Derived Elevation",
            "calibration_level": "Level-4 Topographic Digital Terrain Model",
            "data_provider": "ISRO / SAC"
        }
    },
    # 7. IIRS Product (Imaging Infrared Spectrometer, Chandrayaan-2)
    {
        "product_id": "ch2_iirs_cube_20200818_023",
        "title": "Chandrayaan-2 IIRS Hyperspectral Radiance Cube",
        "mission": "Chandrayaan-2",
        "instrument": "Imaging Infrared Spectrometer (IIRS)",
        "instrument_code": "IIRS",
        "product_type": "Hyperspectral Product",
        "product_type_code": "hyperspectral",
        "acquisition_time": "2020-08-18T09:44:12.000Z",
        "dimensions": "512 × 12000 px × 256 bands",
        "spatial_reference": "IAU2000:30100 (Moon 2000 Simple Cylindrical)",
        "resolution": "80.0 m/px",
        "file_size": "1.42 GB",
        "format": "PDS4 / ENVI Spectral Cube",
        "processing_status": "Ready",
        "footprint": {
            "region_name": "Aristarchus Plateau Pyroclastic Deposits",
            "lat_min": 21.0,
            "lat_max": 27.5,
            "lon_min": -51.0,
            "lon_max": -46.5,
            "center_lat": 24.25,
            "center_lon": -48.75
        },
        "metadata": {
            "orbit_number": 4322,
            "orbit_altitude_km": 100.1,
            "incidence_angle_deg": 32.4,
            "emission_angle_deg": 1.2,
            "phase_angle_deg": 33.1,
            "spectral_range": "0.8 – 5.0 µm (256 Spectral Channels)",
            "spectral_resolution": "~16 nm / channel",
            "detection_objective": "OH / H2O Water-Ice & Hydration Absorption (3 µm)",
            "calibration_level": "Level-2 Calibrated Spectral Radiance",
            "data_provider": "ISRO / Space Applications Centre"
        }
    },
    # 8. OHRC Product (Orbiter High Resolution Camera, Chandrayaan-2)
    {
        "product_id": "ch2_ohrc_cal_20210312_108",
        "title": "Chandrayaan-2 OHRC Ultra-High Resolution Targeted Strip",
        "mission": "Chandrayaan-2",
        "instrument": "Orbiter High Resolution Camera (OHRC)",
        "instrument_code": "OHRC",
        "product_type": "Ultra-High Resolution Product",
        "product_type_code": "ohrc",
        "acquisition_time": "2021-03-12T16:32:08.000Z",
        "dimensions": "12000 × 24000 px",
        "spatial_reference": "IAU2000:30120 (Lunar Polar Stereographic South)",
        "resolution": "0.25 m/px (25 cm Sub-meter)",
        "file_size": "1.18 GB",
        "format": "PDS4 XML + Binary Raster",
        "processing_status": "Ready",
        "footprint": {
            "region_name": "Shackleton Crater Rim & Connecting Ridge",
            "lat_min": -89.8,
            "lat_max": -89.4,
            "lon_min": 115.0,
            "lon_max": 135.0,
            "center_lat": -89.6,
            "center_lon": 125.0
        },
        "metadata": {
            "orbit_number": 6840,
            "orbit_altitude_km": 100.0,
            "incidence_angle_deg": 88.2,
            "emission_angle_deg": 0.5,
            "phase_angle_deg": 88.5,
            "solar_azimuth_deg": 210.4,
            "swath_width_km": "3.0 km Targeted Swath",
            "ground_sampling_distance": "0.25 m/pixel (Highest Resolution in Lunar Orbit)",
            "camera_type": "TDI CCD Panchromatic High-Resolution",
            "calibration_level": "Level-2 Calibrated Radiometric Sensor Data",
            "data_provider": "ISRO / SAC Planetary Sciences"
        }
    },
    # 9. Additional Chandrayaan-1 TMC Nadir Scene (Mare Imbrium)
    {
        "product_id": "ch1_tmc_cal_20090214_018",
        "title": "Chandrayaan-1 TMC Nadir Strip — Mare Imbrium / Archimedes",
        "mission": "Chandrayaan-1",
        "instrument": "Terrain Mapping Camera (TMC-1)",
        "instrument_code": "TMC",
        "product_type": "Calibrated Product",
        "product_type_code": "calibrated",
        "acquisition_time": "2009-02-14T08:15:30.000Z",
        "dimensions": "4000 × 44000 px",
        "spatial_reference": "IAU2000:30100 (Moon 2000 Equidistant Cylindrical)",
        "resolution": "5.0 m/px",
        "file_size": "352.0 MB",
        "format": "PDS3 IMG (.img + .lbl)",
        "processing_status": "Archived",
        "footprint": {
            "region_name": "Mare Imbrium / Archimedes Crater",
            "lat_min": 24.0,
            "lat_max": 38.0,
            "lon_min": -6.0,
            "lon_max": -1.5,
            "center_lat": 31.0,
            "center_lon": -3.75
        },
        "metadata": {
            "orbit_number": 1184,
            "orbit_altitude_km": 100.3,
            "incidence_angle_deg": 52.1,
            "emission_angle_deg": 0.3,
            "phase_angle_deg": 52.0,
            "spectral_band": "500 – 850 nm",
            "camera_view": "Nadir View (0°)",
            "calibration_level": "Level-2 Calibrated Data",
            "data_provider": "ISRO / ISSDC"
        }
    },
    # 10. Additional Chandrayaan-2 TMC Calibrated Strip (Oceanus Procellarum)
    {
        "product_id": "ch2_tmc_cal_20210722_076",
        "title": "Chandrayaan-2 TMC-2 Calibrated Strip — Oceanus Procellarum",
        "mission": "Chandrayaan-2",
        "instrument": "Terrain Mapping Camera-2 (TMC-2)",
        "instrument_code": "TMC",
        "product_type": "Calibrated Product",
        "product_type_code": "calibrated",
        "acquisition_time": "2021-07-22T18:04:19.000Z",
        "dimensions": "4000 × 50000 px",
        "spatial_reference": "IAU2000:30100 (Moon 2000 Equidistant Cylindrical)",
        "resolution": "2.5 m/px",
        "file_size": "800.0 MB",
        "format": "PDS4 XML/IMG",
        "processing_status": "Ready",
        "footprint": {
            "region_name": "Oceanus Procellarum / Marius Hills",
            "lat_min": 10.0,
            "lat_max": 20.0,
            "lon_min": -58.0,
            "lon_max": -53.0,
            "center_lat": 15.0,
            "center_lon": -55.5
        },
        "metadata": {
            "orbit_number": 7922,
            "orbit_altitude_km": 100.0,
            "incidence_angle_deg": 41.5,
            "emission_angle_deg": 0.1,
            "phase_angle_deg": 41.4,
            "spectral_band": "500 – 850 nm (Panchromatic)",
            "camera_view": "Stereo Triplet",
            "calibration_level": "Level-2 Calibrated Standard",
            "data_provider": "ISRO / SAC"
        }
    }
]


def get_all_datasets(
    query: Optional[str] = None,
    mission: Optional[str] = None,
    instrument: Optional[str] = None,
    product_type: Optional[str] = None,
    status: Optional[str] = None,
    year_preset: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """Returns filtered datasets based on query parameters."""
    results = LUNAR_DATASET_CATALOG.copy()

    # Free text search across title, product_id, region, instrument
    if query:
        q = query.lower().strip()
        results = [
            d for d in results
            if q in d["title"].lower()
            or q in d["product_id"].lower()
            or q in d["footprint"]["region_name"].lower()
            or q in d["instrument"].lower()
            or q in d["product_type"].lower()
        ]

    # Mission filter
    if mission and mission.lower() != "all":
        m_lower = mission.lower()
        results = [d for d in results if m_lower in d["mission"].lower()]

    # Instrument filter
    if instrument and instrument.lower() != "all":
        inst_lower = instrument.lower()
        results = [
            d for d in results
            if inst_lower in d["instrument_code"].lower()
            or inst_lower in d["instrument"].lower()
        ]

    # Product type filter
    if product_type and product_type.lower() != "all":
        pt_lower = product_type.lower()
        results = [
            d for d in results
            if pt_lower in d["product_type_code"].lower()
            or pt_lower in d["product_type"].lower()
        ]

    # Status filter
    if status and status.lower() != "all":
        st_lower = status.lower()
        results = [d for d in results if st_lower == d["processing_status"].lower()]

    # Year preset filter (e.g. 2008-2009 for Ch-1, 2019+ for Ch-2)
    if year_preset and year_preset.lower() != "all":
        yp = year_preset.lower()
        filtered = []
        for d in results:
            acq_year = int(d["acquisition_time"][:4])
            if yp == "ch1_era" and acq_year in (2008, 2009):
                filtered.append(d)
            elif yp == "ch2_era" and acq_year >= 2019:
                filtered.append(d)
        results = filtered

    return results


def get_dataset_by_id(product_id: str) -> Optional[Dict[str, Any]]:
    """Fetches a single dataset by product_id."""
    for d in LUNAR_DATASET_CATALOG:
        if d["product_id"].lower() == product_id.lower():
            return d
    return None


def get_dataset_summary_stats() -> Dict[str, Any]:
    """Returns aggregated summary counts for mission catalog analytics."""
    total = len(LUNAR_DATASET_CATALOG)
    ch1_count = sum(1 for d in LUNAR_DATASET_CATALOG if "Chandrayaan-1" in d["mission"])
    ch2_count = sum(1 for d in LUNAR_DATASET_CATALOG if "Chandrayaan-2" in d["mission"])

    instruments = {}
    for d in LUNAR_DATASET_CATALOG:
        code = d["instrument_code"]
        instruments[code] = instruments.get(code, 0) + 1

    product_types = {}
    for d in LUNAR_DATASET_CATALOG:
        pt = d["product_type"]
        product_types[pt] = product_types.get(pt, 0) + 1

    statuses = {}
    for d in LUNAR_DATASET_CATALOG:
        st = d["processing_status"]
        statuses[st] = statuses.get(st, 0) + 1

    return {
        "total_datasets": total,
        "missions": {
            "chandrayaan_1": ch1_count,
            "chandrayaan_2": ch2_count
        },
        "instruments": instruments,
        "product_types": product_types,
        "statuses": statuses
    }
