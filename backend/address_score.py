import requests
import math
import re
from typing import Union

def compute_bounding_box_areas_meters(nominatim_results):
    """
    Computes bounding box areas in meters instead of degrees.
    """
    if not isinstance(nominatim_results, list):
        return []
    
    areas = []
    for item in nominatim_results:
        if "boundingbox" not in item:
            continue
        
        # Extract and convert bounding box coords to floats
        south, north, west, east = map(float, item["boundingbox"])
        
        # Approx center latitude for longitude scaling
        center_lat = (south + north) / 2.0
        lat_m = 111_000  # meters per degree latitude
        lon_m = 111_000 * math.cos(math.radians(center_lat))  # meters per degree longitude
        height_m = abs(north - south) * lat_m
        width_m = abs(east - west) * lon_m
        area_m2 = width_m * height_m
        
        areas.append({
            "south": south,
            "north": north,
            "west": west,
            "east": east,
            "width_m": width_m,
            "height_m": height_m,
            "area_m2": area_m2,
            "result": item  # Keep reference to original result
        })
    
    return areas


def check_with_nominatim(address: str) -> Union[float, str, dict]:
    """
    Validates address using Nominatim API and returns a score based on bounding box areas.
    Returns:
        - dict with 'score' and 'num_results' for success
        - "TIMEOUT" for timeout
        - "API_ERROR" for API failures (network errors, exceptions)
        - 0.0 for invalid address (API succeeded but address not found/filtered out)
    """
    try:
        url = "https://nominatim.openstreetmap.org/search"
        params = {"q": address, "format": "json"}
        headers = {"User-Agent": "MIID-Local-Test/1.0"}
        
        response = requests.get(url, params=params, headers=headers, timeout=5)
        results = response.json()
        
        # Check if we have any results
        if len(results) == 0:
            return 0.0
        
        # Extract numbers from the original address for matching
        original_numbers = set(re.findall(r"[0-9]+", address.lower()))

        # Filter results based on place_rank, name check, and numbers check
        filtered_results = []
        for result in results:
            # Check place_rank is 20 or above
            place_rank = result.get('place_rank', 0)
            if place_rank < 20:
                continue
            # Check that 'name' field exists and is in the original address
            name = result.get('name', '')
            # print(result.get('display_name', ''))
            # print(name)
            if name:
                # Check if name is in the address (case-insensitive)
                if name.lower() not in address.lower():
                    continue
            
            
            # Check that numbers in display_name match numbers from the original address
            display_name = result.get('display_name', '')
            
            print(f"{display_name} \n {address}")
            if display_name:
                display_numbers = set(re.findall(r"[0-9]+", display_name.lower()))
                if original_numbers:
                    # Ensure display numbers exactly match original numbers (no new numbers, no missing numbers)
                    if display_numbers != original_numbers:
                        continue
            
            filtered_results.append(result)
        
        # If no results pass the filters, return 0.0
        if len(filtered_results) == 0:
            return 0.0
        # Calculate bounding box areas for all results (not just filtered)
        areas_data = compute_bounding_box_areas_meters(results)
        
        if len(areas_data) == 0:
            return 0.0
        
        # Extract areas
        areas = [item["area_m2"] for item in areas_data]
        
        # Use the total area for scoring
        total_area = sum(areas)
        
        # Score based on total area
        if total_area < 100:
            score = 1.0
        elif total_area < 1000:
            score = 0.9
        elif total_area < 10000:
            score = 0.8
        elif total_area < 100000:
            score = 0.7
        else:
            score = 0.3
        
        # Store simplified score details (only score and num_results for cache)
        num_results = len(areas)
        
        # Return full details
        # return {
        #     "score": score,
        #     "num_results": num_results,
        #     "areas": areas,
        #     "total_area": total_area,
        #     "areas_data": areas_data
        # }
        
        return score
    except requests.exceptions.Timeout:
        print(f"API timeout for address: {address}")
        return 0.0 
    except requests.exceptions.RequestException as e:
        print(f"Request exception for address '{address}': {type(e).__name__}: {str(e)}")
        return 0.0
    except ValueError as e:
        error_msg = str(e)
        if "codec" in error_msg.lower() and "encode" in error_msg.lower():
            print(f"Encoding error for address '{address}' (treating as timeout): {error_msg}")
            return 0.0 
        else:
            print(f"ValueError (likely JSON parsing) for address '{address}': {error_msg}")
            return 0.0
    except Exception as e:
        print(f"Unexpected exception for address '{address}': {type(e).__name__}: {str(e)}")
        return 0.0



if __name__ == "__main__":
    address = "175-4 Street, Asmara, Maekel Region, Eritrea"
    
    result = check_with_nominatim(address)
    
    print(result)
